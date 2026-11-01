import { describe, expect, it } from "vitest";

import { sanitizeSearch } from "./search";

describe("sanitizeSearch", () => {
  it("剔除会破坏 PostgREST or() 的逗号与括号", () => {
    expect(sanitizeSearch("a,b")).toBe("a b");
    expect(sanitizeSearch("f(x)")).toBe("f x");
    expect(sanitizeSearch("and(1,2)")).toBe("and 1 2");
  });

  it("剔除 LIKE 通配符，用户输入按字面量处理", () => {
    expect(sanitizeSearch("50%_off")).toBe("50 off");
  });

  it("剔除反斜杠", () => {
    expect(sanitizeSearch("a\\b")).toBe("a b");
  });

  it("合并连续空白并去掉首尾空格", () => {
    expect(sanitizeSearch("  防抖   Hook  ")).toBe("防抖 Hook");
  });

  it("保留中文与英文混合内容", () => {
    expect(sanitizeSearch("React 并发渲染")).toBe("React 并发渲染");
  });

  it("截断到 60 个字符，避免超长串撑爆查询 URL", () => {
    expect(sanitizeSearch("字".repeat(200))).toHaveLength(60);
  });

  it("全是非法字符时返回空串（调用方据此跳过过滤条件）", () => {
    expect(sanitizeSearch("%_(),")).toBe("");
  });
});
