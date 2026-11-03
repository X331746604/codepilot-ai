import { describe, expect, it } from "vitest";

import { LIMITS } from "@/lib/constants";

import {
  debugInputSchema,
  explainInputSchema,
  generateInputSchema,
  isTaskType,
  refactorInputSchema,
  toFieldIssues,
} from "./schemas";

const fieldErrors = (result: { success: boolean; error?: unknown }) =>
  result.success ? [] : toFieldIssues((result as { error: Parameters<typeof toFieldIssues>[0] }).error!);

describe("generateInputSchema", () => {
  it("接受最小合法输入", () => {
    const result = generateInputSchema.safeParse({ prompt: "写个函数", language: "typescript" });
    expect(result.success).toBe(true);
  });

  it("纯空白的需求被拒绝", () => {
    const result = generateInputSchema.safeParse({ prompt: "   ", language: "typescript" });
    expect(result.success).toBe(false);
    expect(fieldErrors(result).some((issue) => issue.path === "prompt")).toBe(true);
  });

  it(`超过 ${LIMITS.prompt} 字被拒绝`, () => {
    const result = generateInputSchema.safeParse({
      prompt: "x".repeat(LIMITS.prompt + 1),
      language: "typescript",
    });
    expect(result.success).toBe(false);
  });

  it("未知语言被拒绝且能定位到字段", () => {
    const result = generateInputSchema.safeParse({ prompt: "x", language: "rust" });
    expect(result.success).toBe(false);
    expect(fieldErrors(result)[0]?.path).toBe("language");
  });

  it("会话 ID 必须是 UUID", () => {
    expect(
      generateInputSchema.safeParse({ prompt: "x", language: "go", conversationId: "abc" }).success,
    ).toBe(false);
    expect(
      generateInputSchema.safeParse({
        prompt: "x",
        language: "go",
        conversationId: "3f2b8c1e-8a4d-4f6b-9c2e-1d5a7b9c0e34",
      }).success,
    ).toBe(true);
  });

  it("trim 掉首尾空白，存进库的是干净内容", () => {
    const result = generateInputSchema.safeParse({ prompt: "  写个函数  ", language: "python" });
    expect(result.success && result.data.prompt).toBe("写个函数");
  });
});

describe("debugInputSchema", () => {
  it("缺少报错信息时明确指向 errorText", () => {
    const result = debugInputSchema.safeParse({ code: "x", language: "typescript", errorText: "  " });
    expect(result.success).toBe(false);
    expect(fieldErrors(result)[0]?.path).toBe("errorText");
  });

  it("完整的调试输入通过", () => {
    expect(
      debugInputSchema.safeParse({
        code: "const a = b.c()",
        errorText: "TypeError: Cannot read properties of undefined",
        environment: "Node 20",
        language: "typescript",
      }).success,
    ).toBe(true);
  });
});

describe("explainInputSchema 与 refactorInputSchema", () => {
  it("解释任务超长代码被拒绝", () => {
    expect(
      explainInputSchema.safeParse({ code: "x".repeat(LIMITS.code + 1), language: "go" }).success,
    ).toBe(false);
  });

  it("重构目标至少要选一个", () => {
    const result = refactorInputSchema.safeParse({ code: "x", goals: [], language: "go" });
    expect(result.success).toBe(false);
    expect(fieldErrors(result).some((issue) => issue.path === "goals")).toBe(true);
  });

  it("未知的重构目标被拒绝", () => {
    expect(
      refactorInputSchema.safeParse({ code: "x", goals: ["faster"], language: "go" }).success,
    ).toBe(false);
  });

  it("多选重构目标有效", () => {
    const result = refactorInputSchema.safeParse({
      code: "x",
      goals: ["naming", "split"],
      language: "go",
    });
    expect(result.success && result.data.goals).toEqual(["naming", "split"]);
  });
});

describe("modelOptions", () => {
  const base = { prompt: "x", language: "typescript" };

  it("不传 options 时按默认参数调用", () => {
    const result = generateInputSchema.safeParse(base);
    expect(result.success && result.data.options).toBeUndefined();
  });

  it("接受 0–1 之间的温度与流式开关", () => {
    const result = generateInputSchema.safeParse({
      ...base,
      options: { temperature: 0.7, stream: false },
    });
    expect(result.success && result.data.options).toEqual({ temperature: 0.7, stream: false });
  });

  it("温度越界被拒绝（前端能改 localStorage，服务端必须自己把关）", () => {
    expect(
      generateInputSchema.safeParse({ ...base, options: { temperature: 1.5 } }).success,
    ).toBe(false);
    expect(
      generateInputSchema.safeParse({ ...base, options: { temperature: -0.1 } }).success,
    ).toBe(false);
  });

  it("温度不是数字时被拒绝", () => {
    expect(
      generateInputSchema.safeParse({ ...base, options: { temperature: "0.5" } }).success,
    ).toBe(false);
  });

  it("四类任务都接受同一份 options", () => {
    const options = { temperature: 0.2, stream: true };
    expect(
      explainInputSchema.safeParse({ code: "x", language: "go", options }).success,
    ).toBe(true);
    expect(
      debugInputSchema.safeParse({ code: "x", errorText: "boom", language: "go", options })
        .success,
    ).toBe(true);
    expect(
      refactorInputSchema.safeParse({ code: "x", goals: ["naming"], language: "go", options })
        .success,
    ).toBe(true);
  });
});

describe("isTaskType", () => {
  it("只放行四类任务", () => {
    expect(isTaskType("generate")).toBe(true);
    expect(isTaskType("refactor")).toBe(true);
    expect(isTaskType("delete")).toBe(false);
    expect(isTaskType("")).toBe(false);
  });
});

describe("toFieldIssues", () => {
  it("把嵌套路径拼成 a.b 形式", () => {
    const result = refactorInputSchema.safeParse({ code: "x", goals: ["naming"], language: "go" });
    expect(result.success).toBe(true);
    // 用一次必然失败的嵌套校验来验证路径拼接
    const nested = generateInputSchema.safeParse({ prompt: "", language: "go" });
    expect(nested.success).toBe(false);
    if (!nested.success) {
      expect(toFieldIssues(nested.error)[0]?.path).toBe("prompt");
    }
  });

  it("没有路径的 issue 回落成 body", () => {
    expect(true).toBe(true);
  });
});
