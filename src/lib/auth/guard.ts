/**
 * 页面级守卫。
 *
 * 与 `proxy.ts` 的分工：proxy 只做"有没有会话 cookie"的乐观判断，用来
 * 尽早把未登录用户送去登录页；真正的判定在这里——它调用 auth 服务验证 token。
 * Next 的文档明确说过 proxy 不该作为授权边界，这里照此实现。
 */

import { redirect } from "next/navigation";

import { getSession, type Session } from "./server";

export async function requireSession(nextPath: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}
