/**
 * 模型服务适配层（OpenAI 兼容协议）。
 *
 * 职责边界：只负责"把消息发出去、把增量读回来、把失败分类"，
 * 不关心业务语义（那是 prompts 与 route 的事），也不做任何持久化。
 */

import { DEFAULT_TEMPERATURE, MAX_OUTPUT_TOKENS } from "@/lib/constants";
import type { AiRuntimeConfig } from "@/lib/env";

import { AiError, codeFromHttpStatus, toErrorPayload, type AiErrorPayload } from "./errors";
import type { ChatMessage } from "./prompts";

export type TokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type AiStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: TokenUsage | null; model: string; finishReason: string | null }
  | { type: "error"; error: AiErrorPayload };

export type CallMetrics = {
  /** 实际发出的请求次数（含首次），用于日志观察重试频率 */
  attempts: number;
};

/** 由用户偏好驱动、随请求下发的调用参数。 */
export type CallOptions = {
  temperature?: number;
  /** false 时改为一次性返回；对浏览器的事件协议不变，只是只有一个 delta */
  stream?: boolean;
};

const RETRY_DELAYS_MS = [500, 1_500];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function readUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const usage = raw as Record<string, unknown>;
  const pick = (key: string) => (typeof usage[key] === "number" ? (usage[key] as number) : null);
  const prompt = pick("prompt_tokens");
  const completion = pick("completion_tokens");
  const total = pick("total_tokens");
  if (prompt === null && completion === null && total === null) return null;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

async function postCompletion(
  config: AiRuntimeConfig,
  messages: ChatMessage[],
  signal: AbortSignal,
  metrics: CallMetrics,
  options: CallOptions,
): Promise<Response> {
  const streaming = options.stream !== false;
  let lastError: AiError | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    metrics.attempts = attempt + 1;

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: streaming,
          temperature: options.temperature ?? DEFAULT_TEMPERATURE,
          max_tokens: MAX_OUTPUT_TOKENS,
          // 让服务端在最后一个分片里带上 token 用量；不支持该参数的供应商会忽略它。
          // 非流式响应本来就带 usage，不需要这个字段。
          ...(streaming ? { stream_options: { include_usage: true } } : {}),
        }),
        signal,
        cache: "no-store",
      });

      if (response.ok) return response;

      const detail = await response.text().catch(() => "");
      const error = new AiError(
        codeFromHttpStatus(response.status),
        detail.slice(0, 500) || `HTTP ${response.status}`,
        { httpStatus: response.status },
      );

      // 只对可重试的类别退避重试；401/402 这类重试没有意义。
      if (!error.retryable || attempt === RETRY_DELAYS_MS.length) throw error;
      lastError = error;
    } catch (error) {
      if (isAbortError(error)) throw error;

      const normalized =
        error instanceof AiError
          ? error
          : new AiError("UPSTREAM", "网络请求失败", { cause: error });

      if (!normalized.retryable || attempt === RETRY_DELAYS_MS.length) throw normalized;
      lastError = normalized;
    }

    await sleep(RETRY_DELAYS_MS[attempt] ?? 0);
  }

  throw lastError ?? new AiError("UPSTREAM", "请求失败");
}

/** 逐个解析 SSE 分片，把 OpenAI 兼容格式转成本项目内部事件。 */
async function* parseStream(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<AiStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new AiError("INVALID_RESPONSE", "响应体为空");

  const decoder = new TextDecoder();
  let buffer = "";
  let usage: TokenUsage | null = null;
  let model = "";
  let finishReason: string | null = null;

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const data = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (!data) continue;
        if (data === "[DONE]") {
          yield { type: "done", usage, model, finishReason };
          return;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch (error) {
          throw new AiError("INVALID_RESPONSE", "模型返回了无法解析的分片", { cause: error });
        }

        const body = payload as {
          model?: string;
          usage?: unknown;
          error?: { message?: string };
          choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
        };

        if (body.error) {
          throw new AiError("UPSTREAM", body.error.message ?? "模型返回错误");
        }
        if (body.model) model = body.model;

        const chunkUsage = readUsage(body.usage);
        if (chunkUsage) usage = chunkUsage;

        const choice = body.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;

        const text = choice?.delta?.content;
        if (text) yield { type: "delta", text };
      }
    }

    yield { type: "done", usage, model, finishReason };
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * 非流式响应：一次拿到完整内容，仍然按同一套事件上报。
 *
 * 这样浏览器侧的解析逻辑不需要分叉——关闭流式只是"只有一个 delta"，
 * 而不是"换一种协议"。代价是首字节要等到全部生成完，这正是该开关的含义。
 */
async function* parseCompletion(response: Response): AsyncGenerator<AiStreamEvent> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new AiError("INVALID_RESPONSE", "模型返回了无法解析的响应体", { cause: error });
  }

  const body = payload as {
    model?: string;
    usage?: unknown;
    error?: { message?: string };
    choices?: Array<{
      message?: { content?: string | null };
      finish_reason?: string | null;
    }>;
  };

  if (body.error) {
    throw new AiError("UPSTREAM", body.error.message ?? "模型返回错误");
  }

  const choice = body.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (text) yield { type: "delta", text };

  yield {
    type: "done",
    usage: readUsage(body.usage),
    model: body.model ?? "",
    finishReason: choice?.finish_reason ?? null,
  };
}

export async function* streamCompletion(
  config: AiRuntimeConfig,
  messages: ChatMessage[],
  options: { signal?: AbortSignal; metrics?: CallMetrics } & CallOptions = {},
): AsyncGenerator<AiStreamEvent> {
  const metrics = options.metrics ?? { attempts: 0 };
  const controller = new AbortController();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);

  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await postCompletion(config, messages, controller.signal, metrics, options);
    if (options.stream === false) {
      yield* parseCompletion(response);
    } else {
      yield* parseStream(response, controller.signal);
    }
  } catch (error) {
    if (timedOut) {
      yield { type: "error", error: new AiError("TIMEOUT", "上游响应超时").toPayload() };
    } else if (options.signal?.aborted) {
      yield { type: "error", error: new AiError("CANCELED", "请求已取消").toPayload() };
    } else if (error instanceof AiError && error.code === "CANCELED") {
      yield { type: "error", error: error.toPayload() };
    } else {
      yield { type: "error", error: toErrorPayload(error) };
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
