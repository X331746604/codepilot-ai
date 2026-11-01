import { describe, expect, it } from "vitest";

import { cursorFilter, decodeCursor, encodeCursor } from "./cursor";

const ID = "3f2b8c1e-8a4d-4f6b-9c2e-1d5a7b9c0e34";
const TS = "2026-11-01T06:37:09.375422+00:00";

const raw = (text: string) => Buffer.from(text, "utf8").toString("base64url");

describe("encodeCursor", () => {
  it("生成的串可以直接放进 URL（不含 + / = 与竖线）", () => {
    const encoded = encodeCursor({ ts: TS, id: ID });
    expect(encoded).not.toMatch(/[+/=|\s]/);
  });
});

describe("decodeCursor", () => {
  it("往返一致", () => {
    expect(decodeCursor(encodeCursor({ ts: TS, id: ID }))).toEqual({ ts: TS, id: ID });
  });

  it("拒绝空串与纯数字", () => {
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("12345")).toBeNull();
  });

  it("拒绝不含分隔符的合法 base64", () => {
    expect(decodeCursor(raw("hello world"))).toBeNull();
  });

  it("拒绝主键不是 UUID 的载荷", () => {
    expect(decodeCursor(raw(`${TS}|not-a-uuid`))).toBeNull();
  });

  it("拒绝时间戳无法解析的载荷", () => {
    expect(decodeCursor(raw(`yesterday|${ID}`))).toBeNull();
  });

  it("时间戳里混入竖线时整体拒绝，而不是把畸形数据带进查询", () => {
    expect(decodeCursor(raw(`2026|11|01T00:00:00Z|${ID}`))).toBeNull();
  });

  it("主键大小写不敏感也能解析", () => {
    expect(decodeCursor(raw(`${TS}|${ID.toUpperCase()}`))?.id).toBe(ID.toUpperCase());
  });
});

describe("cursorFilter", () => {
  it("展开成 PostgREST 支持的 or 表达式", () => {
    expect(cursorFilter("last_message_at", { ts: TS, id: ID })).toBe(
      `last_message_at.lt.${TS},and(last_message_at.eq.${TS},id.lt.${ID})`,
    );
  });

  it("片段用 created_at 时只换列名，结构不变", () => {
    expect(cursorFilter("created_at", { ts: TS, id: ID })).toContain("created_at.eq.");
  });
});
