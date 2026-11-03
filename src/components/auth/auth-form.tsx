"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseBrowser } from "@/lib/auth/client";

type Mode = "signin" | "signup";

/** 把 Supabase 的英文错误翻成能照着做的中文，而不是原样丢给用户。 */
function explain(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (text.includes("email not confirmed")) return "邮箱尚未验证，请先点击邮件里的确认链接。";
  if (text.includes("user already registered")) return "这个邮箱已经注册过了，直接登录即可。";
  if (text.includes("password should be at least")) return "密码太短，至少 6 位。";
  if (text.includes("unable to validate email")) return "邮箱格式不正确。";
  if (text.includes("rate limit") || text.includes("too many")) return "操作过于频繁，请稍后再试。";
  return message;
}

export function AuthForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = getSupabaseBrowser();

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;

        // 项目默认开启「Confirm email」：此时不会立刻返回会话
        if (!data.session) {
          setNotice("注册成功，请到邮箱点击确认链接后再登录。");
          setMode("signin");
          return;
        }
      }

      // 服务端组件与 proxy 都要看到新 cookie 才认为已登录
      router.replace(nextPath);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? explain(cause.message) : "操作失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <TabsList className="w-full" aria-label="登录或注册">
          <TabsTrigger value="signin" className="flex-1">
            登录
          </TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">
            注册
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="auth-email">邮箱</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auth-password">密码</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 6 位"
          />
        </div>

        {error ? (
          <p role="alert" className="text-xs leading-relaxed text-destructive">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p role="status" className="text-xs leading-relaxed text-muted-foreground">
            {notice}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              处理中…
            </>
          ) : mode === "signin" ? (
            <>
              <LogIn data-icon="inline-start" />
              登录
            </>
          ) : (
            <>
              <UserPlus data-icon="inline-start" />
              创建账号
            </>
          )}
        </Button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        登录后，会话与代码片段只属于你自己：数据库的行级安全策略会把其他人的数据挡在外面。
      </p>
    </div>
  );
}
