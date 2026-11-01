import { describe, expect, it } from "vitest";

import { trimContext, type HistoryMessage, type ContextWindow } from "./context";

const WINDOW: ContextWindow = { maxMessages: 4, maxCharsPerMessage: 10, maxTotalChars: 30 };

const msg = (role: "user" | "assistant", content: string): HistoryMessage => ({ role, content });

describe("trimContext", () => {
  it("空历史返回空数组且未裁剪", () => {
    const { messages, info } = trimContext([], WINDOW);
    expect(messages).toEqual([]);
    expect(info).toEqual({ messages: 0, truncated: false, totalChars: 0 });
  });

  it("预算内原样保留，顺序不变", () => {
    const history = [msg("user", "aa"), msg("assistant", "bbb")];
    const { messages, info } = trimContext(history, WINDOW);
    expect(messages).toEqual(history);
    expect(info.truncated).toBe(false);
    expect(info.totalChars).toBe(5);
  });

  it("丢弃纯空白消息，不占用预算", () => {
    const { messages, info } = trimContext(
      [msg("user", "   "), msg("assistant", ""), msg("user", "ok")],
      WINDOW,
    );
    expect(messages).toEqual([msg("user", "ok")]);
    expect(info.messages).toBe(1);
  });

  it("超过条数上限时保留最近的几条", () => {
    const history = [
      msg("user", "1"),
      msg("assistant", "2"),
      msg("user", "3"),
      msg("assistant", "4"),
      msg("user", "5"),
      msg("assistant", "6"),
    ];
    const { messages, info } = trimContext(history, WINDOW);
    expect(messages.map((m) => m.content)).toEqual(["3", "4", "5", "6"]);
    expect(info.truncated).toBe(true);
  });

  it("单条超长时截断并补省略号", () => {
    const { messages, info } = trimContext([msg("user", "abcdefghijklmno")], WINDOW);
    expect(messages[0].content).toBe("abcdefghij…");
    // 10 个字符 + 1 个省略号
    expect(messages[0].content).toHaveLength(11);
    expect(info.truncated).toBe(true);
  });

  it("刚好等于单条上限时不截断", () => {
    const { messages, info } = trimContext([msg("user", "1234567890")], WINDOW);
    expect(messages[0].content).toBe("1234567890");
    expect(info.truncated).toBe(false);
  });

  it("总量超预算时从最旧的一条开始丢", () => {
    const history = [msg("user", "aaaaa"), msg("assistant", "bbbbb"), msg("user", "ccccc")];
    const { messages, info } = trimContext(history, { ...WINDOW, maxTotalChars: 10 });
    expect(messages.map((m) => m.content)).toEqual(["bbbbb", "ccccc"]);
    expect(info.totalChars).toBe(10);
    expect(info.truncated).toBe(true);
  });

  it("一条就超预算时会一路丢到空，不会死循环", () => {
    const { messages, info } = trimContext([msg("user", "x".repeat(50))], {
      ...WINDOW,
      maxTotalChars: 5,
    });
    expect(messages).toEqual([]);
    expect(info.truncated).toBe(true);
    expect(info.totalChars).toBe(0);
  });

  it("不修改传入的数组与对象", () => {
    const history = [msg("user", "aaaaa"), msg("assistant", "bbbbb")];
    const snapshot = JSON.parse(JSON.stringify(history));
    trimContext(history, { ...WINDOW, maxTotalChars: 5 });
    expect(history).toEqual(snapshot);
  });

  it("info.messages 与返回数组长度一致", () => {
    const { messages, info } = trimContext(
      [msg("user", "1"), msg("assistant", "2"), msg("user", "3")],
      WINDOW,
    );
    expect(info.messages).toBe(messages.length);
  });
});
