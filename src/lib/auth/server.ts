/**
 * 服务端会话。
 *
 * 用的是 **publishable key + 用户 access token**，不是 secret key。
 * 这样每一条 SQL 都受 RLS 约束：即便某个仓储函数忘了加 owner 过滤，
 * 数据库也不会把别人的数据返回给你。service key 只留给脚本与管理操作。
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cache } from "react";

import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { readSupabasePublicConfig } from "@/lib/env";

/**
 * 建一个绑定了当前请求 cookie 的客户端。
 *
 * `cache()` 让同一个请求内的多次调用共用实例（Route Handler 里可能被调多次），
 * 不同请求之间不会串——cache 的作用域就是单次请求。
 */
export const createServerSupabase = cache(async (): Promise<SupabaseClient> => {
  const config = readSupabasePublicConfig();
  if (!config) {
    throw new DatabaseNotConfiguredError([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component 渲染期不能写 cookie。刷新令牌这件事交给
          // Route Handler 与 proxy，这里静默跳过即可，不要让它变成 500。
        }
      },
    },
  });
});

export type Session = {
  supabase: SupabaseClient;
  user: User;
};

/**
 * 取当前会话，没有就返回 null。
 *
 * 用 `getUser()` 而不是 `getSession()`：后者只读 cookie 里的 JWT 而不校验，
 * 伪造一个未过期的 token 就能骗过它。`getUser()` 会真正调用 auth 服务验证。
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;
  return { supabase, user: data.user };
});
