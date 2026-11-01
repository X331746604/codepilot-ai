/**
 * 浏览器侧的 SSE 消费端。
 *
 * 不用 EventSource，原因有两个：
 * 1. EventSource 只能发 GET，而这里需要 POST 带 JSON body；
 * 2. 需要手动中止（AbortController）与读取非 200 的 JSON 错误体。
 * 因此直接用 fetch + ReadableStream 自己拆帧。
 */

import type { TaskType } from "@/lib/constants";

export type StreamUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type StreamMeta = {
  requestId: string;
  task: string;
  model: string;
  /** 服务端创建或使用的会话 ID；首轮请求时由服务端生成 */
  conversationId?: string;
  /** 服务端实际带入的历史上下文；truncated 为真时界面需要提示 */
  context?: { messages: number; truncated: boolean };
};

export type StreamError = {
  code: string;
  message: string;
  retryable: boolean;
  /** 字段级校验错误，仅在 400 时出现 */
  issues?: Array<{ path: string; message: string }>;
};

export type StreamResult =
  | { ok: true; usage: StreamUsage | null; model: string; meta: StreamMeta | null }
  | { ok: false; error: StreamError; meta: StreamMeta | null };

type Params = {
  task: TaskType;
  body: unknown;
  signal?: AbortSignal;
  onMeta?: (meta: StreamMeta) => void;
  onDelta?: (text: string) => void;
};

/** 服务端未返回结构化错误时的兜底文案。 */
function fallbackError(status: number): StreamError {
  if (status === 429) {
    return { code: "RATE_LIMIT", message: "请求过于频繁，请稍后再试。", retryable: true };
  }
  if (status === 503) {
    return { code: "CONFIG", message: "服务端尚未配置模型服务。", retryable: false };
  }
  return { code: "UPSTREAM", message: `请求失败（HTTP ${status}）。`, retryable: status >= 500 };
}

export async function streamAiTask({
  task,
  body,
  signal,
  onMeta,
  onDelta,
}: Params): Promise<StreamResult> {
  let meta: StreamMeta | null = null;
  let usage: StreamUsage | null = null;
  let model = "";

  let response: Response;
  try {
    response = await fetch(`/api/ai/${task}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        meta,
        error: { code: "CANCELED", message: "已停止生成。", retryable: false },
      };
    }
    return {
      ok: false,
      meta,
      error: { code: "NETWORK", message: "网络连接失败，请检查网络后重试。", retryable: true },
    };
  }

  // 非 200 时服务端返回的是普通 JSON，不是事件流
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string; retryable?: boolean }; issues?: StreamError["issues"] }
      | null;

    return {
      ok: false,
      meta,
      error: {
        ...fallbackError(response.status),
        ...(payload?.error?.code ? { code: payload.error.code } : {}),
        ...(payload?.error?.message ? { message: payload.error.message } : {}),
        ...(payload?.error?.retryable !== undefined ? { retryable: payload.error.retryable } : {}),
        issues: payload?.issues,
      },
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      meta,
      error: { code: "INVALID_RESPONSE", message: "浏览器未能读取响应流。", retryable: false },
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let streamError: StreamError | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;

        let event: unknown;
        try {
          event = JSON.parse(data);
        } catch {
          continue; // 半个帧还没拼完，交给下一轮
        }

        const payload = event as {
          type?: string;
          text?: string;
          usage?: StreamUsage | null;
          model?: string;
          requestId?: string;
          task?: string;
          conversationId?: string;
          context?: { messages: number; truncated: boolean };
          error?: StreamError;
        };

        switch (payload.type) {
          case "meta":
            meta = {
              requestId: payload.requestId ?? "",
              task: payload.task ?? task,
              model: payload.model ?? "",
              conversationId: payload.conversationId,
              context: payload.context,
            };
            onMeta?.(meta);
            break;
          case "delta":
            if (payload.text) onDelta?.(payload.text);
            break;
          case "done":
            usage = payload.usage ?? null;
            model = payload.model ?? "";
            break;
          case "error":
            if (payload.error) streamError = payload.error;
            break;
          default:
            break;
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        meta,
        error: { code: "CANCELED", message: "已停止生成。", retryable: false },
      };
    }
    return {
      ok: false,
      meta,
      error: { code: "NETWORK", message: "连接中断，已保留已生成的内容。", retryable: true },
    };
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (streamError) return { ok: false, meta, error: streamError };

  return { ok: true, meta, usage, model };
}
