/**
 * Route Handler 的鉴权入口。
 *
 * 统一成 `authenticate()` 而不是每个路由各写一遍，原因有两个：
 * 1. 少写就会漏写——漏一个路由就等于开了一个匿名数据口子；
 * 2. 返回结构固定，路由里只需要 `if (!auth.ok) return auth.response`。
 */

import type { Db } from "@/lib/db/client";
import { dbErrorResponse, jsonError } from "@/lib/db/http";

import { getSession } from "./server";

export type ApiAuth = {
  /** 用户态客户端：所有查询都受 RLS 约束 */
  db: Db;
  userId: string;
  email: string;
};

export type AuthResult = { ok: true; auth: ApiAuth } | { ok: false; response: Response };

export async function authenticate(): Promise<AuthResult> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, response: jsonError(401, "UNAUTHORIZED", "请先登录") };
    }

    return {
      ok: true,
      auth: {
        db: session.supabase,
        userId: session.user.id,
        email: session.user.email ?? "",
      },
    };
  } catch (error) {
    // 配置缺失等异常不能变成 500 裸奔，交给统一的错误映射
    return { ok: false, response: dbErrorResponse(error) };
  }
}
