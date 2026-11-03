"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { UserMenu } from "@/components/auth/user-menu";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePreferences } from "@/hooks/use-preferences";
import { getLanguageLabel, getTaskType, LANGUAGES, TASK_TYPES } from "@/lib/constants";
import { TEMPERATURE_RANGE } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
] as const;

/** 服务端配置说明。这里只写变量名与示例，真实值不会出现在页面上。 */
const ENV_ROWS = [
  {
    name: "AI_BASE_URL",
    purpose: "OpenAI 兼容端点",
    example: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  { name: "AI_API_KEY", purpose: "服务端密钥（不会下发到浏览器）", example: "sk-…" },
  { name: "AI_MODEL", purpose: "模型名", example: "qwen-plus" },
  { name: "AI_TIMEOUT_MS", purpose: "单次调用超时", example: "60000" },
  {
    name: "AI_RATE_LIMIT_PER_MINUTE",
    purpose: "每 IP 每分钟请求上限",
    example: "10",
  },
  { name: "AI_RATE_LIMIT_PER_HOUR", purpose: "每 IP 每小时请求上限", example: "60" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", purpose: "数据库项目地址（可公开）", example: "https://xxx.supabase.co" },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", purpose: "浏览器端密钥（受 RLS 限制）", example: "sb_publishable_…" },
  { name: "SUPABASE_SECRET_KEY", purpose: "服务端管理密钥（绕过 RLS，仅脚本使用）", example: "sb_secret_…" },
] as const;

const noopSubscribe = () => () => {};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未知";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function SettingsView({
  email,
  createdAt,
  defaultLanguage,
}: {
  email: string;
  createdAt: string;
  /** 来自 profiles 表，改动会写回数据库 */
  defaultLanguage: string;
}) {
  const { preferences, update, reset } = usePreferences();
  const { theme, setTheme } = useTheme();

  // 默认语言存在服务端，先本地乐观更新，失败再回滚
  const [language, setLanguage] = useState(defaultLanguage);
  const [savingLanguage, setSavingLanguage] = useState(false);

  // 服务端拿不到用户主题，水合前不要给按钮加"选中"态，否则会出现两次高亮
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  async function handleLanguageChange(next: string) {
    const previous = language;
    setLanguage(next);
    setSavingLanguage(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultLanguage: next }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message ?? "保存失败");
      }

      toast.success(`默认语言已改为 ${getLanguageLabel(next)}`);
    } catch (cause) {
      setLanguage(previous);
      toast.error(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      setSavingLanguage(false);
    }
  }

  function handleReset() {
    reset();
    toast.success("已恢复默认设置");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4 sm:px-6">
          <Brand />
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm">设置</span>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/workspace">
                <ArrowLeft data-icon="inline-start" />
                返回工作台
              </Link>
            </Button>
            <ThemeToggle />
            <UserMenu email={email} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6 sm:px-6">
        <p className="text-xs leading-relaxed text-muted-foreground">
          本页的偏好分两类：<strong className="font-medium text-foreground">账号偏好</strong>
          存在数据库、换设备也在；<strong className="font-medium text-foreground">本机偏好</strong>
          存在浏览器里，不会同步。
        </p>

        <Section title="账号" description="账号偏好保存在数据库，跟随账号而不是浏览器。">
          <Row label="邮箱" description="登录凭据，修改需要走 Supabase 后台">
            <span className="font-mono text-xs">{email}</span>
          </Row>

          <Row label="注册时间" description="账号创建日期">
            <span className="font-mono text-xs">{formatDate(createdAt)}</span>
          </Row>

          <Row
            label="默认语言"
            description="新建会话与片段时使用；改动会立即写入数据库"
            htmlFor="pref-language"
          >
            <Select
              value={language}
              onValueChange={(value) => void handleLanguageChange(value)}
              disabled={savingLanguage}
            >
              <SelectTrigger id="pref-language" className="w-[11rem]" aria-label="默认语言">
                <SelectValue>{getLanguageLabel(language)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Section>

        <Section title="默认值" description="只存在本机浏览器，换设备不会带上。">
          <Row label="默认任务类型" description="打开工作台时默认选中的标签页" htmlFor="pref-task">
            <Select
              value={preferences.defaultTaskType}
              onValueChange={(value) =>
                update({ defaultTaskType: value as typeof preferences.defaultTaskType })
              }
            >
              <SelectTrigger id="pref-task" className="w-[11rem]" aria-label="默认任务类型">
                <SelectValue>{getTaskType(preferences.defaultTaskType).label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Section>

        <Section
          title="模型调用"
          description="这两项会随每次请求下发给服务端，服务端仍会重新校验取值范围。"
        >
          <Row
            label="采样温度"
            description="越低越稳定、越高越发散。代码场景建议 0.1–0.4。"
            htmlFor="pref-temperature"
          >
            <div className="flex items-center gap-3">
              <input
                id="pref-temperature"
                type="range"
                min={TEMPERATURE_RANGE.min}
                max={TEMPERATURE_RANGE.max}
                step={TEMPERATURE_RANGE.step}
                value={preferences.temperature}
                onChange={(event) => update({ temperature: Number(event.target.value) })}
                aria-label="采样温度"
                className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-muted [accent-color:var(--foreground)]"
              />
              <span className="w-8 text-right font-mono text-xs tabular-nums">
                {preferences.temperature.toFixed(1)}
              </span>
            </div>
          </Row>

          <Row label="流式输出" description="关闭后等待全文生成完再一次显示，首字延迟会明显变长。">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {preferences.streaming ? "流式" : "一次性"}
              </span>
              <Switch
                checked={preferences.streaming}
                onCheckedChange={(checked) => update({ streaming: checked })}
                aria-label="流式输出"
              />
            </div>
          </Row>
        </Section>

        <Section title="外观" description="主题存在浏览器本地，与账号无关。">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="主题">
            {THEME_OPTIONS.map((option) => {
              const active = mounted && theme === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                  aria-pressed={active}
                  className={cn(active ? "font-medium" : "text-muted-foreground")}
                  onClick={() => setTheme(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </Section>

        <Section
          title="服务端配置"
          description="模型与数据库的凭据只存在于服务器环境变量中，本页不会读取、也不会展示真实值。"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">变量名</th>
                  <th className="py-1.5 pr-3 font-medium">作用</th>
                  <th className="py-1.5 font-medium">示例</th>
                </tr>
              </thead>
              <tbody>
                {ENV_ROWS.map((row) => (
                  <tr key={row.name} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{row.name}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.purpose}</td>
                    <td className="py-1.5 font-mono text-muted-foreground">{row.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              完整的变量清单与注释见仓库根目录的 <code className="font-mono">.env.example</code>；
              本地实际值写在 <code className="font-mono">.env.local</code>（已被 Git 忽略）。
            </p>
            <p>
              <code className="font-mono">SUPABASE_SECRET_KEY</code> 能绕过所有 RLS，
              只允许脚本与管理操作使用——请求路径一律走用户态客户端，不碰它。
            </p>
            <p>
              切换模型供应商只需改 <code className="font-mono">AI_BASE_URL</code> /{" "}
              <code className="font-mono">AI_API_KEY</code> /{" "}
              <code className="font-mono">AI_MODEL</code> 三项，前提是对方兼容 OpenAI 协议。
              若对方不支持 <code className="font-mono">stream_options.include_usage</code>，
              需要先在 <code className="font-mono">src/lib/ai/provider.ts</code> 里去掉这一项，
              否则可能返回 400。
            </p>
          </div>
        </Section>

        <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            恢复默认只重置本机偏好（任务类型、温度、流式开关、主题），
            不影响账号偏好、会话、消息与代码片段。
          </p>
          <Button variant="outline" size="sm" onClick={handleReset} className="shrink-0">
            <RotateCcw data-icon="inline-start" />
            恢复默认
          </Button>
        </div>
      </main>
    </div>
  );
}
