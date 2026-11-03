import type { TaskType } from "@/lib/constants";

export type MessageUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type ConversationRow = {
  id: string;
  /** 0004 迁移起为 not null，由数据库默认值 auth.uid() 填充 */
  owner_id: string;
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

export type SnippetRow = {
  id: string;
  /** 0004 迁移起为 not null，由数据库默认值 auth.uid() 填充 */
  owner_id: string;
  title: string;
  language: string;
  code: string;
  description: string | null;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
};

/** 与 auth.users 一一对应的公开资料。 */
export type ProfileRow = {
  id: string;
  email: string;
  default_language: string;
  created_at: string;
  updated_at: string;
};

/** 接口返回给前端的资料视图，不含任何内部标识以外的东西。 */
export type ProfileView = {
  email: string;
  defaultLanguage: string;
  createdAt: string;
};
