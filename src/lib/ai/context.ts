/**
 * 上下文裁剪。
 *
 * 为什么要独立成纯函数：这是本项目里最容易被"凭感觉改"的逻辑——加一条消息、
 * 放宽一个上限，都会悄悄抬高 token 成本。抽成纯函数后可以单测覆盖边界，
 * 也便于在日志里说明"这一轮到底带了多少上下文"。
 *
 * 三条规则（与需求文档 FR-6.4 对应）：
 * 1. 只保留最近 N 条消息；
 * 2. 单条过长的内容截断，保留开头；
 * 3. 总量超预算时，从最旧的一条开始丢弃。
 */

import { CONTEXT_WINDOW } from "@/lib/constants";

export type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ContextInfo = {
  /** 实际带入模型的历史消息条数 */
  messages: number;
  /** 是否发生了任何裁剪（条数、单条长度、总量） */
  truncated: boolean;
  /** 历史消息的总字符数（不含本轮输入与系统提示） */
  totalChars: number;
};

export type ContextWindow = {
  maxMessages: number;
  maxCharsPerMessage: number;
  maxTotalChars: number;
};

const ELLIPSIS = "…";

export function trimContext(
  history: readonly HistoryMessage[],
  window: ContextWindow = CONTEXT_WINDOW,
): { messages: HistoryMessage[]; info: ContextInfo } {
  let truncated = false;

  // 1. 丢掉空消息，它们只会浪费预算
  let list: HistoryMessage[] = history
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }));

  // 2. 只保留最近 N 条
  if (list.length > window.maxMessages) {
    list = list.slice(-window.maxMessages);
    truncated = true;
  }

  // 3. 单条截断
  list = list.map((message) => {
    if (message.content.length <= window.maxCharsPerMessage) return message;
    truncated = true;
    return {
      role: message.role,
      content: message.content.slice(0, window.maxCharsPerMessage) + ELLIPSIS,
    };
  });

  // 4. 总量超预算时从最旧开始丢
  let totalChars = list.reduce((sum, message) => sum + message.content.length, 0);
  while (totalChars > window.maxTotalChars && list.length > 0) {
    const removed = list.shift();
    if (!removed) break;
    totalChars -= removed.content.length;
    truncated = true;
  }

  return {
    messages: list,
    info: { messages: list.length, truncated, totalChars },
  };
}
