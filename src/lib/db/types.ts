import type { TaskType } from "@/lib/constants";

export type MessageUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type ConversationRow = {
  id: string;
  owner_id: string | null;
  title: string;
  task_type: TaskType;
  language: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

export type MessageRole = "user" | "assistant";
export type MessageStatus = "ok" | "partial" | "error";

export type MessageRow = {
  id: string;
  conversation_id: string;
  seq: number;
  role: MessageRole;
  content: string;
  task_type: TaskType;
  language: string;
  status: MessageStatus;
  error_category: string | null;
  usage: MessageUsage | null;
  latency_ms: number | null;
  created_at: string;
};

/** 侧栏用的精简结构，不把消息正文带进列表接口。 */
export type ConversationSummary = Pick<
  ConversationRow,
  "id" | "title" | "task_type" | "language" | "last_message_at" | "created_at"
>;
