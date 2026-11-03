import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_TEMPERATURE, MAX_OUTPUT_TOKENS } from "@/lib/constants";

import { streamCompletion, type AiStreamEvent } from "./provider";

const CONFIG = {
  baseUrl: "https://example.test/v1",
  apiKey: "test-key",
  model: "test-model",
  timeoutMs: 5_000,
  rateLimitPerMinute: 10,
  rateLimitPerHour: 60,
};

const MESSAGES = [
  { role: "system" as const, content: "sys" },
  { role: "user" as const, content: "hi" },
];

function mockFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url, init) => handler(url, init ?? {}),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function collect(gen: AsyncGenerator<AiStreamEvent>) {
  const events: AiStreamEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function bodyOf(init: RequestInit) {
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("streamCompletion 流式", () => {
  it("把上游分片转成 delta + done，并带回 usage", async () => {
    mockFetch(async () =>
      sseResponse([
        'data: {"model":"m1","choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"model":"m1","choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}\n\n',
        'data: {"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
        "data: [DONE]\n\n",
      ]),
    );

    const events = await collect(streamCompletion(CONFIG, MESSAGES));

    expect(events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text)).toEqual([
      "你",
      "好",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      model: "m1",
      finishReason: "stop",
      usage: { totalTokens: 5 },
    });
  });

  it("默认请求流式、带 stream_options、温度用默认值", async () => {
    const fetchMock = mockFetch(async () => sseResponse(["data: [DONE]\n\n"]));
    await collect(streamCompletion(CONFIG, MESSAGES));

    const body = bodyOf(fetchMock.mock.calls[0]![1]!);
    expect(body).toMatchObject({
      model: "test-model",
      stream: true,
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream_options: { include_usage: true },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.test/v1/chat/completions");
  });
});

describe("streamCompletion 非流式（用户关闭流式开关）", () => {
  it("一次性返回时只有一个 delta，其余协议不变", async () => {
    const fetchMock = mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            model: "m2",
            choices: [{ message: { content: "完整答案" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
          { status: 200 },
        ),
    );

    const events = await collect(streamCompletion(CONFIG, MESSAGES, { stream: false }));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "delta", text: "完整答案" });
    expect(events[1]).toMatchObject({ type: "done", model: "m2", usage: { totalTokens: 30 } });

    const body = bodyOf(fetchMock.mock.calls[0]![1]!);
    expect(body.stream).toBe(false);
    // 非流式响应自带 usage，再传 stream_options 会被部分供应商判为非法参数
    expect(body).not.toHaveProperty("stream_options");
  });

  it("内容为空时不产出 delta，但仍有 done（用量要落库）", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            model: "m3",
            choices: [{ message: { content: "" }, finish_reason: "stop" }],
            usage: { total_tokens: 7 },
          }),
          { status: 200 },
        ),
    );

    const events = await collect(streamCompletion(CONFIG, MESSAGES, { stream: false }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "done", usage: { totalTokens: 7 } });
  });

  it("响应体不是 JSON 时报 INVALID_RESPONSE，而不是把脏数据当成答案", async () => {
    mockFetch(async () => new Response("<html>oops</html>", { status: 200 }));

    const events = await collect(streamCompletion(CONFIG, MESSAGES, { stream: false }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", error: { code: "INVALID_RESPONSE" } });
  });
});

describe("streamCompletion 参数与错误", () => {
  it("temperature 取自调用方", async () => {
    const fetchMock = mockFetch(async () => sseResponse(["data: [DONE]\n\n"]));
    await collect(streamCompletion(CONFIG, MESSAGES, { temperature: 0.9 }));
    expect(bodyOf(fetchMock.mock.calls[0]![1]!).temperature).toBe(0.9);
  });

  it("401 映射成 AUTH 且不重试", async () => {
    const fetchMock = mockFetch(async () => new Response("invalid key", { status: 401 }));

    const events = await collect(streamCompletion(CONFIG, MESSAGES));

    expect(events[0]).toMatchObject({ type: "error", error: { code: "AUTH", retryable: false } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("5xx 会重试一次后成功", async () => {
    let calls = 0;
    const fetchMock = mockFetch(async () => {
      calls += 1;
      if (calls === 1) return new Response("boom", { status: 500 });
      return sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"]);
    });

    const events = await collect(streamCompletion(CONFIG, MESSAGES));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === "delta")).toHaveLength(1);
  }, 10_000);

  it("上游 402 映射成 QUOTA（额度不足，重试无意义）", async () => {
    const fetchMock = mockFetch(async () => new Response("quota", { status: 402 }));
    const events = await collect(streamCompletion(CONFIG, MESSAGES));

    expect(events[0]).toMatchObject({ type: "error", error: { code: "QUOTA", retryable: false } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
