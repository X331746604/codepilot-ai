/**
 * 调用日志。
 *
 * 明确不记录的字段：Prompt 正文、模型完整响应、API Key、用户邮箱。
 * 只保留"能算账、能排障、不泄露隐私"的元数据。
 */

import type { TaskType } from "@/lib/constants";

import type { AiErrorCode } from "./errors";

export type AiCallStatus = "ok" | "error" | "canceled";

export type AiUsageLog = {
  requestId: string;
  task: TaskType;
  model: string;
  status: AiCallStatus;
  errorCode?: AiErrorCode;
  latencyMs: number;
  attempts: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** 输出字符数，用于粗略估算"这次回答有多长"，不含内容本身 */
  outputChars: number;
  /** 本轮实际带入的历史消息条数 */
  contextMessages: number;
  /** 历史是否被裁剪（条数 / 单条长度 / 总量任一触发） */
  contextTruncated: boolean;
};

export function logAiUsage(entry: AiUsageLog): void {
  // 单行 JSON，便于 Vercel / 日志平台按字段检索
  console.info(JSON.stringify({ scope: "ai.usage", ...entry }));
}
