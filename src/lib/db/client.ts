/**
 * Supabase 服务端客户端。
 *
 * 只允许在 Route Handler / 服务端模块里引入。这里用的是 secret / service_role
 * 级别的密钥，它能绕过所有 RLS —— 一旦泄漏等于交出整个数据库。
 *
 * 用单例缓存：Route Handler 在同一进程内会被反复调用，
 * 每次 new 一个客户端会白白重建连接池。
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readSupabaseConfig } from "@/lib/env";

let cached: SupabaseClient | null = null;

export class DatabaseNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`数据库未配置，缺少环境变量：${missing.join("、")}`);
    this.name = "DatabaseNotConfiguredError";
    this.missing = missing;
  }
}

export function getDb(): SupabaseClient {
  if (cached) return cached;

  const result = readSupabaseConfig();
  if (!result.ok) throw new DatabaseNotConfiguredError(result.missing);

  cached = createClient(result.config.url, result.config.key, {
    auth: {
      // 服务端无用户会话，关掉自动刷新与本地持久化
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { "X-Client-Info": "codepilot-ai/server" },
    },
  });

  return cached;
}

/** 仅用于测试：清空单例。 */
export function resetDbClient(): void {
  cached = null;
}
