import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 路由守卫（Next 16 把 Middleware 改名为 Proxy）。
 *
 * 这里只做**乐观检查**：看有没有 Supabase 的会话 cookie，有就放行、没有就送去登录页。
 * 刻意不在这里调用 `getUser()`——proxy 跑在每个请求前面，多一次网络往返不值当，
 * 而且 Next 的文档明确说 proxy 不应作为授权边界。
 *
 * 真正的身份校验发生在页面（`requireSession`）与接口（`authenticate`）里，
 * 它们会向 auth 服务验证 token 真伪，伪造 cookie 过不了那一关。
 */

const PROTECTED_PREFIXES = ["/workspace", "/snippets", "/settings"];

const AUTH_COOKIE_HINT = "-auth-token";

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes(AUTH_COOKIE_HINT));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 接口自己做鉴权并返回 401 JSON，重定向会让前端拿到一段 HTML
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const authed = hasSessionCookie(request);

  if (!authed && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (authed && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // 静态资源与图片不需要过守卫
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
