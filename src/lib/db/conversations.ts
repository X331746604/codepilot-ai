/**
 * 会话与消息的仓储层。
 *
 * 约定：
 * - 只在这里出现表名与列名，路由与组件不直接拼查询；
 * - 所有错误统一收敛成 DbError，路由据此返回稳定的 HTTP 状态；
 * - seq 由服务端分配，客户端不能指定（否则会破坏消息顺序）。
 */

import type { TaskType } from "@/lib/constants";

import { getDb } from "./client";
import type { ConversationRow, MessageRole, MessageRow, MessageStatus, MessageUsage } from "./types";

export class DbError extends Error {
  readonly code: string;

  constructor(message: string, code = "DB_ERROR", options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = "DbError";
    this.code = code;
  }
}

type PostgrestLikeError = { message: string; code?: string; details?: string | null };

function raise(operation: string, error: PostgrestLikeError | null): never {
  throw new DbError(
    `${operation}失败：${error?.message ?? "未知错误"}${error?.details ? `（${error.details}）` : ""}`,
    error?.code ?? "DB_ERROR",
  );
}

const DEFAULT_TITLE = "新会话";

export async function createConversation(input: {
  taskType: TaskType;
  language: string;
  title?: string;
}): Promise<ConversationRow> {
  const { data, error } = await getDb()
    .from("conversations")
    .insert({
      title: input.title?.trim() || DEFAULT_TITLE,
      task_type: input.taskType,
      language: input.language,
    })
    .select("*")
    .single();

  if (error) raise("创建会话", error);
  return data as ConversationRow;
}

export async function listConversations(limit = 20): Promise<ConversationRow[]> {
  const { data, error } = await getDb()
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (error) raise("读取会话列表", error);
  return (data ?? []) as ConversationRow[];
}

export async function getConversation(id: string): Promise<ConversationRow | null> {
  const { data, error } = await getDb().from("conversations").select("*").eq("id", id).maybeSingle();
  if (error) raise("读取会话", error);
  return (data as ConversationRow | null) ?? null;
}

export async function renameConversation(id: string, title: string): Promise<ConversationRow | null> {
  const { data, error } = await getDb()
    .from("conversations")
    .update({ title: title.trim() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) raise("重命名会话", error);
  return (data as ConversationRow | null) ?? null;
}

export async function deleteConversation(id: string): Promise<boolean> {
  const { error, count } = await getDb()
    .from("conversations")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) raise("删除会话", error);
  return (count ?? 0) > 0;
}

export async function listMessages(conversationId: string, limit = 200): Promise<MessageRow[]> {
  const { data, error } = await getDb()
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true })
    .limit(limit);

  if (error) raise("读取消息", error);
  return (data ?? []) as MessageRow[];
}

type AppendMessageInput = {
  conversationId: string;
  role: MessageRole;
  content: string;
  taskType: TaskType;
  language: string;
  status?: MessageStatus;
  errorCategory?: string | null;
  usage?: MessageUsage | null;
  latencyMs?: number | null;
};

/**
 * 追加消息，并分配会话内自增的 seq。
 *
 * 取 max(seq)+1 再插入存在竞态：两个并发请求可能拿到同一个序号，
 * 此时唯一约束会拒绝其中一个，因此这里对 23505 做有限次重试。
 * 单用户场景下冲突概率极低；将来并发上升时，应改为在数据库里用
 * "update conversations set message_count = message_count + 1 returning"
 * 的方式分配序号（行锁天然串行化）。
 */
export async function appendMessage(input: AppendMessageInput): Promise<MessageRow> {
  const db = getDb();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data: last, error: maxError } = await db
      .from("messages")
      .select("seq")
      .eq("conversation_id", input.conversationId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle<{ seq: number }>();

    if (maxError) raise("读取消息序号", maxError);

    const seq = (last?.seq ?? 0) + 1;

    const { data, error } = await db
      .from("messages")
      .insert({
        conversation_id: input.conversationId,
        seq,
        role: input.role,
        content: input.content,
        task_type: input.taskType,
        language: input.language,
        status: input.status ?? "ok",
        error_category: input.errorCategory ?? null,
        usage: input.usage ?? null,
        latency_ms: input.latencyMs ?? null,
      })
      .select("*")
      .single();

    if (!error) return data as MessageRow;

    // 唯一约束冲突：序号被并发占用了，重新取号
    if (error.code === "23505") continue;
    raise("写入消息", error);
  }

  throw new DbError("写入消息失败：消息序号连续冲突", "SEQ_CONFLICT");
}

/**
 * 首条消息写入后，把默认标题替换成内容摘要。
 * 只在标题仍为默认值时生效，避免覆盖用户手动改过的名字。
 */
export async function titleFromFirstPrompt(conversationId: string, prompt: string): Promise<void> {
  const title = prompt.replace(/\s+/g, " ").trim().slice(0, 20);
  if (!title) return;

  const { error } = await getDb()
    .from("conversations")
    .update({ title })
    .eq("id", conversationId)
    .eq("title", DEFAULT_TITLE);

  if (error) raise("更新会话标题", error);
}

/** 供上下文拼接使用：按时间正序取最近若干条消息。 */
export async function recentMessages(conversationId: string, limit: number): Promise<MessageRow[]> {
  const { data, error } = await getDb()
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: false })
    .limit(limit);

  if (error) raise("读取历史消息", error);
  return ((data ?? []) as MessageRow[]).reverse();
}
