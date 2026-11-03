import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAiRoute } from "./handler";

/**
 * 路由编排层的契约测试。
 *
 * 只覆盖"不碰数据库、不调模型"的那部分：校验、限流前置顺序、配置缺失。
 * 真实调用需要模型服务与数据库，交给 e2e 主链路。
 */

const AI_ENV = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "AI_TIMEOUT_MS"] as const;
const DB_ENV = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of [...AI_ENV, ...DB_ENV]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.AI_API_KEY = "test-key";
  process.env.AI_BASE_URL = "https://example.test/v1";
  process.env.AI_MODEL = "test-model";
});

afterEach(() => {
  for (const key of [...AI_ENV, ...DB_ENV]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function post(body: unknown) {
  const route = createAiRoute("generate");
  return route(
    new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("请求体校验", () => {
  it("非 JSON 返回 400 BAD_REQUEST", async () => {
    const response = await post("{oops");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
  });

  it("空 prompt 返回 400 并精确指向字段", async () => {
    const response = await post({ prompt: "   ", language: "typescript" });
    expect(response.status).toBe(400);

    const body = (await response.json()) as { error: { code: string }; issues: Array<{ path: string }> };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.issues[0]?.path).toBe("prompt");
  });

  it("temperature 越界被拒绝，且路径带 options 前缀", async () => {
    const response = await post({
      prompt: "x",
      language: "typescript",
      options: { temperature: 1.5 },
    });
    expect(response.status).toBe(400);

    const body = (await response.json()) as { issues: Array<{ path: string; message: string }> };
    expect(body.issues[0]?.path).toBe("options.temperature");
    expect(body.issues[0]?.message).toContain("0–1");
  });

  it("stream 类型不对被拒绝", async () => {
    const response = await post({ prompt: "x", language: "go", options: { stream: "yes" } });
    expect(response.status).toBe(400);
  });

  it("未知语言被拒绝", async () => {
    const response = await post({ prompt: "x", language: "rust" });
    expect(response.status).toBe(400);
  });

  it("超过请求体上限返回 413", async () => {
    const response = await post({ prompt: "x".repeat(170 * 1024), language: "go" });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  });
});

describe("配置缺失", () => {
  it("没有模型配置时返回 503 CONFIG 并点名缺失的变量", async () => {
    delete process.env.AI_API_KEY;

    const response = await post({ prompt: "x", language: "go" });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("CONFIG");
    expect(body.error.message).toContain("AI_API_KEY");
  });

  it("模型已配置但数据库未配置时，说明校验已通过、失败发生在落库阶段", async () => {
    const response = await post({ prompt: "x", language: "go", options: { temperature: 0.5 } });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "CONFIG" } });
  });
});

describe("校验先于限流", () => {
  it("参数错误不消耗额度：连续 20 次非法请求仍然返回 400 而不是 429", async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = await post({ prompt: "", language: "go" });
      expect(response.status).toBe(400);
    }
  });
});
