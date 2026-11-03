import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 路由守卫（Next 16 把 Middleware 改名为 Proxy）。
 *
 * 两件事：
 * 1. 会话的**乐观检查**——看有没有 Supabase 的会话 cookie，没有就送去登录页。
 *    刻意不在这里调用 `getUser()`：proxy 跑在每个请求前面，多一次网络往返不值当，
 *    且 Next 的文档明确说 proxy 不应作为授权边界。真正的校验在页面与接口里。
 * 2. 为每个 HTML 响应生成 CSP nonce。Next 会从请求头的 CSP 里解析出 nonce，
 *    自动加到它自己注入的脚本上（见 node_modules/next/dist/docs 的 CSP 指南）。
 */

const PROTECTED_PREFIXES = ["/workspace", "/snippets", "/settings"];

const AUTH_COOKIE_HINT = "-auth-token";

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes(AUTH_COOKIE_HINT));
}

/** 只允许连到自己的 Supabase 项目；开发时额外放行 HMR 的 websocket。 */
function connectSources(isDev: boolean): string {
  const sources = ["'self'"];

  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (raw) {
    try {
      const url = new URL(raw);
      sources.push(url.origin);
      // 浏览器端只走 HTTPS；ws 版本一并放行，避免 Realtime 以后接进来时踩坑
      sources.push(`wss://${url.host}`);
    } catch {
      // 配置写错时不要因此让整站 500，CSP 少一条来源即可
    }
  }

  if (isDev) {
    // Turbopack 的 HMR 走 websocket
    sources.push("ws://127.0.0.1:*", "ws://localhost:*");
  }

  return sources.join(" ");
}

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // strict-dynamic 让 Next 注入的脚本可以继续加载它自己的 chunk，
    // 同时使白名单对 script 失效——这是 nonce 方案的关键。
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // 样式保留 'unsafe-inline'：Turbopack 的开发态 HMR 会动态插入 <style>，
    // next-themes 也会改行内样式。样式注入的危害远小于脚本，这里不为它牺牲可用性。
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src ${connectSources(isDev)}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // 本地是 http，升级请求会把静态资源打到 https 上直接失败
    isDev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 接口自己做鉴权并返回 401 JSON，重定向会让前端拿到一段 HTML；
  // 接口响应也不是 HTML，不需要 CSP。
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const isDev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const authed = hasSessionCookie(request);

  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  let response: NextResponse;

  if (!authed && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    response = NextResponse.redirect(url);
  } else if (authed && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace";
    url.search = "";
    response = NextResponse.redirect(url);
  } else {
    response = next();
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // 静态资源与图片不需要过守卫，也不需要 CSP
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
