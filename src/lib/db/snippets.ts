/**
 * 代码片段仓储。
 *
 * 与 conversations 分开一个文件，是因为两者的查询模式完全不同：
 * 会话按时间倒序翻页，片段需要"标题或正文"的模糊搜索 + 语言筛选。
 */

import { getDb } from "./client";
import { DbError } from "./conversations";
import type { SnippetRow } from "./types";

type PostgrestLikeError = { message: string; code?: string; details?: string | null };

function raise(operation: string, error: PostgrestLikeError | null): never {
  throw new DbError(
    `${operation}失败：${error?.message ?? "未知错误"}${error?.details ? `（${error.details}）` : ""}`,
    error?.code ?? "DB_ERROR",
  );
}

/**
 * 清理搜索词。
 *
 * PostgREST 的 `or()` 用逗号和括号分隔条件，搜索词里出现这些字符会把过滤器
 * 拆坏；`%` 与 `_` 是 LIKE 通配符，用户输入的应该被当作字面量。
 * 直接剔除而不是转义，是因为这里只需要"能搜到大概"，不需要精确匹配语义。
 */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[(),%_\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function createSnippet(input: {
  title: string;
  language: string;
  code: string;
  description?: string | null;
  sourceMessageId?: string | null;
}): Promise<SnippetRow> {
  const { data, error } = await getDb()
    .from("snippets")
    .insert({
      title: input.title.trim(),
      language: input.language,
      code: input.code,
      description: input.description?.trim() || null,
      source_message_id: input.sourceMessageId ?? null,
    })
    .select("*")
    .single();

  if (error) raise("保存片段", error);
  return data as SnippetRow;
}

export async function listSnippets(options: {
  q?: string;
  language?: string;
  limit?: number;
}): Promise<SnippetRow[]> {
  const limit = options.limit ?? 30;
  let query = getDb().from("snippets").select("*").order("created_at", { ascending: false }).limit(limit);

  if (options.language) query = query.eq("language", options.language);

  const keyword = options.q ? sanitizeSearch(options.q) : "";
  if (keyword) {
    // ilike 大小写不敏感；同时匹配标题与代码正文
    query = query.or(`title.ilike.%${keyword}%,code.ilike.%${keyword}%`);
  }

  const { data, error } = await query;
  if (error) raise("读取片段列表", error);
  return (data ?? []) as SnippetRow[];
}

export async function getSnippet(id: string): Promise<SnippetRow | null> {
  const { data, error } = await getDb().from("snippets").select("*").eq("id", id).maybeSingle();
  if (error) raise("读取片段", error);
  return (data as SnippetRow | null) ?? null;
}

export async function updateSnippet(
  id: string,
  patch: { title?: string; language?: string; code?: string; description?: string | null },
): Promise<SnippetRow | null> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) payload.title = patch.title.trim();
  if (patch.language !== undefined) payload.language = patch.language;
  if (patch.code !== undefined) payload.code = patch.code;
  if (patch.description !== undefined) payload.description = patch.description?.trim() || null;

  const { data, error } = await getDb()
    .from("snippets")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) raise("更新片段", error);
  return (data as SnippetRow | null) ?? null;
}

export async function deleteSnippet(id: string): Promise<boolean> {
  const { error, count } = await getDb().from("snippets").delete({ count: "exact" }).eq("id", id);
  if (error) raise("删除片段", error);
  return (count ?? 0) > 0;
}
