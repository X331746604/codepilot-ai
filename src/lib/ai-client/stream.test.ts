import { afterEach, describe, expect, it, vi } from "vitest";

import { streamAiTask } from "./stream";

const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

/** 把若干分片拼成一个流式响应；每个分片会被单独 read 一次。 */
function streamOf(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

function mockFetch(result: Response | (() => Promise<Response>)) {
  // 显式标注参数类型，否则 mock.calls 会被推断成空元组，取不到调用的第一个参数
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    typeof result === "function" ? result : async () => result,
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const BASE = { task: "generate" as const, body: { prompt: "x" } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamAiTask 正常流", () => {
  it("拼接 delta、上报 meta、带回真实 usage", async () => {
    mockFetch(
      streamOf([
        frame({ type: "meta", requestId: "r1", task: "generate", model: "qwen-plus" }),
        frame({ type: "delta", text: "## 思路" }),
        frame({ type: "delta", text: "\n先做这个" }),
        frame({
          type: "done",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          model: "qwen-plus",
        }),
      ]),
    );

    const chunks: string[] = [];
    let conversationId: string | undefined;
    const result = await streamAiTask({
      ...BASE,
      onMeta: (meta) => {
        conversationId = meta.conversationId;
      },
      onDelta: (text) => chunks.push(text),
    });

    expect(chunks.join("")).toBe("## 思路\n先做这个");
    expect(conversationId).toBeUndefined();
    expect(result).toMatchObject({
      ok: true,
      model: "qwen-plus",
      usage: { totalTokens: 30 },
      meta: { requestId: "r1" },
    });
  });

  it("一帧被拆成两个分片时仍然正确解析", async () => {
    mockFetch(
      streamOf([
        'data: {"type":"delta","text":"你',
        '好"}\n\n',
        frame({ type: "done", usage: null, model: "m" }),
      ]),
    );

    const chunks: string[] = [];
    await streamAiTask({ ...BASE, onDelta: (text) => chunks.push(text) });
    expect(chunks).toEqual(["你好"]);
  });

  it("兼容 CRLF 换行（部分反代会自动改写）", async () => {
    mockFetch(streamOf(['data: {"type":"delta","text":"ok"}\r\n\r\n']));
    const chunks: string[] = [];
    await streamAiTask({ ...BASE, onDelta: (text) => chunks.push(text) });
    expect(chunks).toEqual(["ok"]);
  });

  it("忽略注释帧与坏 JSON，不中断整个流", async () => {
    mockFetch(
      streamOf([
        ": keep-alive\n\n",
        "data: {broken json\n\n",
        frame({ type: "delta", text: "仍要继续" }),
        frame({ type: "done", usage: null, model: "m" }),
      ]),
    );

    const chunks: string[] = [];
    const result = await streamAiTask({ ...BASE, onDelta: (text) => chunks.push(text) });
    expect(chunks.join("")).toBe("仍要继续");
    expect(result.ok).toBe(true);
  });

  it("meta 事件里的 conversationId 与 context 会透传", async () => {
    mockFetch(
      streamOf([
        frame({
          type: "meta",
          requestId: "r2",
          model: "m",
          conversationId: "3f2b8c1e-8a4d-4f6b-9c2e-1d5a7b9c0e34",
          context: { messages: 4, truncated: true },
        }),
        frame({ type: "done", usage: null, model: "m" }),
      ]),
    );

    const result = await streamAiTask({ ...BASE });
    expect(result.meta).toMatchObject({
      conversationId: "3f2b8c1e-8a4d-4f6b-9c2e-1d5a7b9c0e34",
      context: { messages: 4, truncated: true },
    });
  });

  it("流里出现 error 事件时整体判为失败", async () => {
    mockFetch(
      streamOf([
        frame({ type: "delta", text: "一半" }),
        frame({ type: "error", error: { code: "RATE_LIMIT", message: "太快了", retryable: true } }),
      ]),
    );

    const result = await streamAiTask({ ...BASE });
    expect(result).toMatchObject({ ok: false, error: { code: "RATE_LIMIT" } });
  });
});

describe("streamAiTask 失败路径", () => {
  it("400 时沿用服务端给的字段级错误", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          error: { code: "VALIDATION", message: "输入不合法", retryable: false },
          issues: [{ path: "prompt", message: "请先描述你的需求" }],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await streamAiTask({ ...BASE });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", message: "输入不合法", retryable: false },
    });
    expect(result.ok === false && result.error.issues?.[0]).toEqual({
      path: "prompt",
      message: "请先描述你的需求",
    });
  });

  it("503 且响应体不是 JSON 时兜底成 CONFIG", async () => {
    mockFetch(new Response("<html>bad gateway</html>", { status: 503 }));
    const result = await streamAiTask({ ...BASE });
    expect(result).toMatchObject({ ok: false, error: { code: "CONFIG", retryable: false } });
  });

  it("429 兜底成可重试的 RATE_LIMIT", async () => {
    mockFetch(new Response("", { status: 429 }));
    const result = await streamAiTask({ ...BASE });
    expect(result).toMatchObject({ ok: false, error: { code: "RATE_LIMIT", retryable: true } });
  });

  it("500 兜底成可重试的 UPSTREAM", async () => {
    mockFetch(new Response("", { status: 500 }));
    const result = await streamAiTask({ ...BASE });
    expect(result).toMatchObject({ ok: false, error: { code: "UPSTREAM", retryable: true } });
  });

  it("fetch 直接抛 AbortError 时归类为 CANCELED", async () => {
    mockFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
    const result = await streamAiTask({ ...BASE });
    expect(result).toMatchObject({ ok: false, error: { code: "CANCELED", retryable: false } });
  });

  it("网络异常归类为可重试的 NETWORK", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const result = await streamAiTask({ ...BASE });
    expect(result).toMatchObject({ ok: false, error: { code: "NETWORK", retryable: true } });
  });

  it("响应没有可读流时报 INVALID_RESPONSE", async () => {
    mockFetch(new Response(null, { status: 200 }));
    const result = await streamAiTask({ ...BASE });
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_RESPONSE" } });
  });

  it("读到一半被中止时返回 CANCELED，且已生成的片段已交给回调", async () => {
    const encoder = new TextEncoder();
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        if (reads === 1) {
          controller.enqueue(encoder.encode(frame({ type: "delta", text: "一半" })));
          return;
        }
        controller.error(new DOMException("aborted", "AbortError"));
      },
    });
    mockFetch(new Response(body, { status: 200 }));

    const chunks: string[] = [];
    const result = await streamAiTask({ ...BASE, onDelta: (text) => chunks.push(text) });

    expect(chunks).toEqual(["一半"]);
    expect(result).toMatchObject({ ok: false, error: { code: "CANCELED", retryable: false } });
  });

  it("请求打到对应任务的路径上", async () => {
    const fetchMock = mockFetch(streamOf([frame({ type: "done", usage: null, model: "m" })]));
    await streamAiTask({ task: "debug", body: { code: "x" } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/ai/debug");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });
});
