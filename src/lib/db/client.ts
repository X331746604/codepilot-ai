/**
 * 数据库客户端的类型与错误。
 *
 * 这里刻意**不提供**全局单例：接入认证后，每次请求用的是
 * 「当前登录用户」的客户端（携带其 access token，受 RLS 约束）。
 * 如果还留一个进程级单例，很容易在某个路由里顺手复用，
 * 结果用错身份读写数据——那是这类项目最典型的事故。
 *
 * 仓储函数一律把客户端作为第一个参数传入，由路由决定用谁的身份。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Db = SupabaseClient;

export class DatabaseNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`数据库未配置，缺少环境变量：${missing.join("、")}`);
    this.name = "DatabaseNotConfiguredError";
    this.missing = missing;
  }
}
