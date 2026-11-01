/**
 * 四个 AI 路由共用同一套编排逻辑：限流 → 配置 → 解析 → 校验 → 组装 → 流式转发 → 记日志。
 * 每个 route.ts 只是 `export const POST = createAiRoute("generate")`，避免四份重复代码。
 */

import type { TaskType } from "@/lib/constants";
import { readAiConfig } from "@/lib/env";

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
 * 所以这个阈值约等于"字符数"。启用多轮后，最大组合（12000 字本轮输入
 * + 24000 字历史 + JSON 转义）约 40k 字符，留出余量取 160k。
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

    const { messages, context } = buildMessages(
      toTaskRequest(task, parsed.data),
      parsed.data.history ?? [],
    );
    const metrics: CallMetrics = { attempts: 0 };
    const encoder = new TextEncoder();

    let status: AiCallStatus = "ok";
    let errorCode: AiErrorCode | undefined;
    let usage: TokenUsage | null = null;
    let model = config.model;
    let outputChars = 0;
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
          context: { messages: context.messages, truncated: context.truncated },
        });

        try {
          for await (const event of streamCompletion(config, messages, {
            signal: request.signal,
            metrics,
          })) {
            if (event.type === "delta") outputChars += event.text.length;
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
          logAiUsage({
            requestId,
            task,
            model,
            status,
            errorCode,
            latencyMs: Date.now() - startedAt,
            attempts: metrics.attempts,
            promptTokens: usage?.promptTokens ?? null,
            completionTokens: usage?.completionTokens ?? null,
            totalTokens: usage?.totalTokens ?? null,
            outputChars,
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
