/**
 * 会话与消息的仓储层。
 *
 * 约定：
 * - 只在这里出现表名与列名，路由与组件不直接拼查询；
 * - 第一个参数永远是数据库客户端：它代表"以谁的身份访问"，
 *   RLS 依据它携带的 access token 决定能看见哪些行；
 * - 所有错误统一收敛成 DbError，路由据此返回稳定的 HTTP 状态；
 * - seq 由服务端分配，客户端不能指定（否则会破坏消息顺序）。
 */

import type { TaskType } from "@/lib/constants";

import type { Db } from "./client";
import { cursorFilter, encodeCursor, type Cursor } from "./cursor";
import { sanitizeSearch } from "./search";
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

export async function createConversation(
  db: Db,
  input: { taskType: TaskType; language: string; title?: string },
): Promise<ConversationRow> {
  const { data, error } = await db
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

export type ConversationPage = {
  rows: ConversationRow[];
  /** 为 null 表示已经没有下一页 */
  nextCursor: string | null;
};

/**
 * 侧栏列表：按 last_message_at 倒序翻页，支持标题关键词与时间范围。
 *
 * 多取一条来判断"是否还有下一页"，避免为了一个布尔值多跑一次 count(*)。
 */
export async function listConversations(
  db: Db,
  options: {
    limit: number;
    cursor?: Cursor | null;
    keyword?: string;
    /** ISO 时间戳；只返回该时刻之后的会话 */
    since?: string | null;
  },
): Promise<ConversationPage> {
  const { limit } = options;

  let query = db
    .from("conversations")
    .select("*")
    // 两列排序：last_message_at 可能重复，补一个 id 才能让游标定位唯一
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (options.since) query = query.gte("last_message_at", options.since);

  const keyword = options.keyword ? sanitizeSearch(options.keyword) : "";
  if (keyword) query = query.ilike("title", `%${keyword}%`);

  if (options.cursor) {
    query = query.or(cursorFilter("last_message_at", options.cursor));
  }

  const { data, error } = await query;
  if (error) raise("读取会话列表", error);

  const fetched = (data ?? []) as ConversationRow[];
  const hasMore = fetched.length > limit;
  const rows = hasMore ? fetched.slice(0, limit) : fetched;
  const last = rows.at(-1);

  return {
    rows,
    nextCursor: hasMore && last ? encodeCursor({ ts: last.last_message_at, id: last.id }) : null,
  };
}

export async function getConversation(db: Db, id: string): Promise<ConversationRow | null> {
  const { data, error } = await db.from("conversations").select("*").eq("id", id).maybeSingle();
  if (error) raise("读取会话", error);
  return (data as ConversationRow | null) ?? null;
}

export async function renameConversation(
  db: Db,
  id: string,
  title: string,
): Promise<ConversationRow | null> {
  const { data, error } = await db
    .from("conversations")
    .update({ title: title.trim() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) raise("重命名会话", error);
  return (data as ConversationRow | null) ?? null;
}

export async function deleteConversation(db: Db, id: string): Promise<boolean> {
  const { error, count } = await db.from("conversations").delete({ count: "exact" }).eq("id", id);

  if (error) raise("删除会话", error);
  return (count ?? 0) > 0;
}

export async function listMessages(
  db: Db,
  conversationId: string,
  limit = 200,
): Promise<MessageRow[]> {
  const { data, error } = await db
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
export async function appendMessage(db: Db, input: AppendMessageInput): Promise<MessageRow> {
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
export async function titleFromFirstPrompt(
  db: Db,
  conversationId: string,
  prompt: string,
): Promise<void> {
  const title = prompt.replace(/\s+/g, " ").trim().slice(0, 20);
  if (!title) return;

  const { error } = await db
    .from("conversations")
    .update({ title })
    .eq("id", conversationId)
    .eq("title", DEFAULT_TITLE);

  if (error) raise("更新会话标题", error);
}

/** 供上下文拼接使用：按时间正序取最近若干条消息。 */
export async function recentMessages(
  db: Db,
  conversationId: string,
  limit: number,
): Promise<MessageRow[]> {
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: false })
    .limit(limit);

  if (error) raise("读取历史消息", error);
  return ((data ?? []) as MessageRow[]).reverse();
}
