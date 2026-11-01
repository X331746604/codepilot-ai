import { describe, expect, it } from "vitest";

import { AiError, AI_ERROR_CODES, codeFromHttpStatus, toErrorPayload } from "./errors";

describe("codeFromHttpStatus", () => {
  it.each([
    [401, "AUTH"],
    [403, "AUTH"],
    [402, "QUOTA"],
    [429, "RATE_LIMIT"],
    [408, "TIMEOUT"],
    [504, "TIMEOUT"],
    [500, "UPSTREAM"],
    [502, "UPSTREAM"],
    [503, "UPSTREAM"],
  ])("%i → %s", (status, code) => {
    expect(codeFromHttpStatus(status)).toBe(code);
  });

  it("未覆盖的状态码兜到 UPSTREAM，不会返回 undefined", () => {
    expect(codeFromHttpStatus(418)).toBe("UPSTREAM");
  });
});

describe("AiError", () => {
  it("retryable 由错误类别决定，而不是调用方随意传", () => {
    expect(new AiError("RATE_LIMIT", "x").retryable).toBe(true);
    expect(new AiError("TIMEOUT", "x").retryable).toBe(true);
    expect(new AiError("UPSTREAM", "x").retryable).toBe(true);
    expect(new AiError("AUTH", "x").retryable).toBe(false);
    expect(new AiError("CONFIG", "x").retryable).toBe(false);
    expect(new AiError("QUOTA", "x").retryable).toBe(false);
    expect(new AiError("INVALID_RESPONSE", "x").retryable).toBe(false);
    expect(new AiError("CANCELED", "x").retryable).toBe(false);
  });

  it("八个错误码都有 retryable 与用户文案，没有漏配的键", () => {
    for (const code of AI_ERROR_CODES) {
      const payload = new AiError(code, "内部细节不会外泄").toPayload();
      expect(payload.code).toBe(code);
      expect(payload.message.length).toBeGreaterThan(0);
      expect(typeof payload.retryable).toBe("boolean");
    }
  });

  it("toPayload 只用面向用户的文案，不透出构造时传入的内部信息", () => {
    const payload = new AiError("UPSTREAM", "connect ECONNREFUSED 127.0.0.1:7897").toPayload();
    expect(payload.message).not.toContain("ECONNREFUSED");
  });
});

describe("toErrorPayload", () => {
  it("AiError 原样收敛", () => {
    expect(toErrorPayload(new AiError("AUTH", "bad key"))).toMatchObject({
      code: "AUTH",
      retryable: false,
    });
  });

  it("AbortError 归类为 CANCELED 且不可重试", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(toErrorPayload(abort)).toMatchObject({ code: "CANCELED", retryable: false });
  });

  it("普通异常兜底成可重试的 UPSTREAM，且不带出原始堆栈", () => {
    const payload = toErrorPayload(new Error("secret internal detail"));
    expect(payload.code).toBe("UPSTREAM");
    expect(payload.retryable).toBe(true);
    expect(payload.message).not.toContain("secret");
  });

  it("非 Error 值也不会抛异常", () => {
    expect(toErrorPayload("字符串").code).toBe("UPSTREAM");
    expect(toErrorPayload(null).code).toBe("UPSTREAM");
  });
});
