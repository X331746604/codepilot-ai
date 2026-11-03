"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 浏览器端客户端，只用于登录/注册/退出这类认证动作。
 *
 * 业务数据一律走 `/api/*`：把查询直接放浏览器里意味着前端要理解表结构，
 * 而且 RLS 之外没有第二道校验（比如"输入长度是否合法"）。
 */

let cached: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (cached) return cached;

  // 必须写成字面量访问，Next 才会在构建时把值内联进客户端包
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY，无法连接认证服务",
    );
  }

  cached = createBrowserClient(url, key);
  return cached;
}
