import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `登录 · ${APP_NAME}`,
  description: "登录后使用 AI 编程工作台，会话与代码片段按账号隔离。",
};

/**
 * 只接受站内相对路径作为登录后的跳转目标。
 * 放开 `//evil.com` 这类值就是开放重定向，等于把登录页变成钓鱼跳板。
 */
function safeNext(raw: string | undefined): string {
  if (!raw) return "/workspace";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/workspace";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:px-6">
        <Brand />
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:justify-between lg:gap-16">
        <section className="max-w-md space-y-3 text-center lg:text-left">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            登录后，工作台才是你的
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            会话、消息与代码片段按账号隔离。数据库的 RLS 策略要求每一行的
            <code className="mx-1 font-mono text-xs">owner_id</code>
            等于当前登录用户，接口层也会拒绝未登录请求。
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            这是个人项目，没有找回密码的邮件通道——忘记密码时请直接在 Supabase
            后台重置。
          </p>
          <Link
            href="/"
            className="inline-block text-xs text-muted-foreground underline underline-offset-4"
          >
            先看看首页
          </Link>
        </section>

        <section className="w-full max-w-sm rounded-xl border p-5 shadow-sm">
          <AuthForm nextPath={safeNext(next)} />
        </section>
      </main>
    </div>
  );
}
