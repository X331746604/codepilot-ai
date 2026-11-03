/**
 * 个人资料的仓储层。
 *
 * `profiles` 与 `auth.users` 一一对应，由注册触发器自动建档；
 * 这里的写入只涉及展示字段与业务偏好，不碰认证信息。
 */

import type { Db } from "./client";
import { DbError } from "./conversations";
import type { ProfileRow } from "./types";

type PostgrestLikeError = { message: string; code?: string; details?: string | null };

function raise(operation: string, error: PostgrestLikeError | null): never {
  throw new DbError(
    `${operation}失败：${error?.message ?? "未知错误"}${error?.details ? `（${error.details}）` : ""}`,
    error?.code ?? "DB_ERROR",
  );
}

export async function getProfile(db: Db, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) raise("读取个人资料", error);
  return (data as ProfileRow | null) ?? null;
}

export async function updateDefaultLanguage(
  db: Db,
  userId: string,
  language: string,
): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from("profiles")
    .update({ default_language: language, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (error) raise("更新默认语言", error);
  return (data as ProfileRow | null) ?? null;
}
