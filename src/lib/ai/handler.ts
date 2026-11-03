/**
 * 四个 AI 路由共用同一套编排逻辑：
 * 限流 → 配置 → 解析 → 校验 → 定位会话 → 读历史 → 落用户消息 → 流式转发 → 落助手消息 → 记日志。
 *
 * 持久化放在这里而不是客户端，是为了让"数据库里的记录"成为唯一事实来源：
 * 客户端刷新、换标签页、甚至伪造请求，都不会让历史与实际调用脱节。
 */

import { CONTEXT_WINDOW, type TaskType } from "@/lib/constants";
import { getSession } from "@/lib/auth/server";
import {
  appendMessage,
  createConversation,
  getConversation,
  recentMessages,
  titleFromFirstPrompt,
} from "@/lib/db/conversations";
import { dbErrorResponse } from "@/lib/db/http";
import { readAiConfig } from "@/lib/env";

import type { HistoryMessage } from "./context";
import { toErrorPayload, type AiErrorCode } from "./errors";
import { buildMessages, type TaskRequest } from "./prompts";
import { streamCompletion, type CallMetrics, type TokenUsage } from "./provider";
import { checkRateLimit } from "./rate-limit";
import {
  TASK_INPUT_SCHEMAS,
  toFieldIssues,
  type DebugInput,
  type ExplainInput,
  type FieldIssue,
  type GenerateInput,
  type RefactorInput,
} from "./schemas";
import { logAiUsage, type AiCallStatus } from "./usage";

/**
 * 请求体上限。注意 `String.length` 计的是 UTF-16 码元而不是字节，
 * 所以这个阈值约等于"字符数"。历史改由服务端读取后，请求体只含本轮输入，
 * 保留 160k 是给大段代码留余量。
 */
const MAX_BODY_BYTES = 160 * 1024;

type JsonErrorOptions = {
  issues?: FieldIssue[];
  headers?: Record<string, string>;
};

function jsonError(status: number, code: string, message: string, options: JsonErrorOptions = {}) {
  return Response.json(
    { error: { code, message }, issues: options.issues },
    {
      status,
      headers: { "Cache-Control": "no-store", ...options.headers },
    },
  );
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "local";
}

function toTaskRequest(task: TaskType, input: unknown): TaskRequest {
  // 这里的分支与 TASK_INPUT_SCHEMAS 一一对应，schema 已保证字段形状。
  switch (task) {
    case "generate":
      return { task, input: input as GenerateInput };
    case "explain":
      return { task, input: input as ExplainInput };
    case "debug":
      return { task, input: input as DebugInput };
    case "refactor":
      return { task, input: input as RefactorInput };
  }
}

/**
 * 取"用户真正写下的内容"作为会话标题来源。
 * 不能用拼装后的消息：那里面带着「编程语言：…」「需求：…」这类模板前缀，
 * 截断后标题会变成 "编程语言：JavaScript 需求：写…"，既难看也无信息量。
 */
function summarizeInput(request: TaskRequest): string {
  switch (request.task) {
    case "generate":
      return request.input.prompt;
    case "explain":
    case "debug":
    case "refactor":
      return request.input.code;
  }
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-transform 很关键：部分反向代理会缓冲并压缩响应，导致流式变成"一次性吐出"
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export function createAiRoute(task: TaskType) {
  return async function POST(request: Request): Promise<Response> {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();

    const configResult = readAiConfig();
    if (!configResult.ok) {
      return jsonError(503, "CONFIG", `模型服务未配置，缺少环境变量：${configResult.missing.join("、")}`);
    }
    const config = configResult.config;

    // 鉴权放在最前面：未登录的请求不该消耗任何解析与上游额度。
    // 这里用的是用户态客户端（受 RLS 约束），不是 secret key。
    let session;
    try {
      session = await getSession();
    } catch (error) {
      return dbErrorResponse(error);
    }
    if (!session) return jsonError(401, "UNAUTHORIZED", "请先登录后再使用");
    const db = session.supabase;

    const rawBody = await request.text().catch(() => "");
    if (rawBody.length > MAX_BODY_BYTES) {
      return jsonError(413, "PAYLOAD_TOO_LARGE", "请求内容过大，请缩短输入");
    }

    let payload: unknown;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return jsonError(400, "BAD_REQUEST", "请求体必须是合法的 JSON");
    }

    const parsed = TASK_INPUT_SCHEMAS[task].safeParse(payload);
    if (!parsed.success) {
      return jsonError(400, "VALIDATION", "输入不合法，请按提示修改", {
        issues: toFieldIssues(parsed.error),
      });
    }

    // 限流放在校验之后：参数写错不应该消耗真实额度，只有真正要调用模型时才计数。
    const limit = checkRateLimit(clientKey(request), {
      perMinute: config.rateLimitPerMinute,
      perHour: config.rateLimitPerHour,
    });
    if (!limit.allowed) {
      return jsonError(429, "RATE_LIMIT", "请求过于频繁，请稍后再试", {
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    // ---- 会话与历史（数据库为唯一来源）----
    let conversationId: string;
    let history: HistoryMessage[] = [];

    try {
      if (parsed.data.conversationId) {
        const existing = await getConversation(db, parsed.data.conversationId);
        if (!existing) return jsonError(404, "NOT_FOUND", "会话不存在或已被删除");
        conversationId = existing.id;

        // 取历史必须在写入本轮用户消息之前，否则历史里会多出一条重复的当前输入
        const rows = await recentMessages(db, conversationId, CONTEXT_WINDOW.maxMessages);
        history = rows.map((row) => ({ role: row.role, content: row.content }));
      } else {
        const created = await createConversation(db, {
          taskType: task,
          language: parsed.data.language,
        });
        conversationId = created.id;
      }
    } catch (error) {
      return dbErrorResponse(error);
    }

    const taskRequest = toTaskRequest(task, parsed.data);
    const { messages, context } = buildMessages(taskRequest, history);
    const userInput = summarizeInput(taskRequest);

    try {
      await appendMessage(db, {
        conversationId,
        role: "user",
        // 存"用户原话"而不是拼装后的模型提示词：刷新后气泡里应当还是自己写的那句话，
        // 而不是「编程语言：TypeScript 需求：…」这种模板文本。
        content: userInput,
        taskType: task,
        language: parsed.data.language,
      });
      // 首条消息写入后把「新会话」替换成内容摘要；非首条时该更新不影响任何行
      await titleFromFirstPrompt(db, conversationId, userInput);
    } catch (error) {
      return dbErrorResponse(error);
    }

    const metrics: CallMetrics = { attempts: 0 };
    const encoder = new TextEncoder();

    let status: AiCallStatus = "ok";
    let errorCode: AiErrorCode | undefined;
    let usage: TokenUsage | null = null;
    let model = config.model;
    let assistantText = "";
    let finished = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown): boolean => {
          if (finished) return false;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            return true;
          } catch {
            // 客户端已断开：停止后续写入，但不要抛错，否则会污染日志
            finished = true;
            return false;
          }
        };

        send({
          type: "meta",
          requestId,
          task,
          model: config.model,
          conversationId,
          context: { messages: context.messages, truncated: context.truncated },
        });

        try {
          for await (const event of streamCompletion(config, messages, {
            signal: request.signal,
            metrics,
            temperature: parsed.data.options?.temperature,
            stream: parsed.data.options?.stream,
          })) {
            if (event.type === "delta") assistantText += event.text;
            if (event.type === "done") {
              usage = event.usage;
              model = event.model || model;
            }
            if (event.type === "error") {
              status = event.error.code === "CANCELED" ? "canceled" : "error";
              errorCode = event.error.code;
            }

            if (!send(event)) break;
            if (event.type === "error") break;
          }
        } catch (error) {
          const payloadError = toErrorPayload(error);
          status = payloadError.code === "CANCELED" ? "canceled" : "error";
          errorCode = payloadError.code;
          send({ type: "error", error: payloadError });
        } finally {
          if (!finished) {
            finished = true;
            controller.close();
          }

          const latencyMs = Date.now() - startedAt;

          // 有内容才落库：完全失败（一个字都没生成）时保留一条空消息没有价值
          if (assistantText.length > 0) {
            try {
              await appendMessage(db, {
                conversationId,
                role: "assistant",
                content: assistantText,
                taskType: task,
                language: parsed.data.language,
                status: status === "ok" ? "ok" : "partial",
                errorCategory: errorCode ?? null,
                usage: usage
                  ? {
                      promptTokens: usage.promptTokens,
                      completionTokens: usage.completionTokens,
                      totalTokens: usage.totalTokens,
                    }
                  : null,
                latencyMs,
              });
            } catch (error) {
              // 落库失败不能让已经返回给用户的内容变成错误，只记录
              console.error(
                JSON.stringify({
                  scope: "ai.persist_failed",
                  requestId,
                  message: error instanceof Error ? error.message.slice(0, 300) : "unknown",
                }),
              );
            }
          }

          logAiUsage({
            requestId,
            task,
            model,
            status,
            errorCode,
            latencyMs,
            attempts: metrics.attempts,
            promptTokens: usage?.promptTokens ?? null,
            completionTokens: usage?.completionTokens ?? null,
            totalTokens: usage?.totalTokens ?? null,
            outputChars: assistantText.length,
            contextMessages: context.messages,
            contextTruncated: context.truncated,
          });
        }
      },
      cancel() {
        finished = true;
      },
    });

    return new Response(stream, { headers: sseHeaders() });
  };
}
