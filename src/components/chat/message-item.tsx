"use client";

import { AlertCircle, RefreshCw, Sparkles, Square } from "lucide-react";

import { CopyButton } from "@/components/code/copy-button";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLanguageLabel, getTaskType } from "@/lib/constants";
import type { Exchange } from "@/hooks/use-ai-task";
import { cn } from "@/lib/utils";

const ERROR_HINTS: Record<string, string> = {
  CONFIG: "服务端没有配置模型服务，请联系维护者。",
  AUTH: "模型服务的凭据无效，需要更换 API Key。",
  RATE_LIMIT: "触发了频率限制，等一会儿再试。",
  QUOTA: "账户额度不足。",
  TIMEOUT: "模型响应超时，可以缩短输入后重试。",
  UPSTREAM: "模型服务暂时不可用。",
  INVALID_RESPONSE: "模型返回的内容无法解析。",
  NETWORK: "网络连接中断，或服务端未启动。",
};

function formatDuration(ms?: number): string {
  if (!ms) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function formatTokens(usage: Exchange["usage"]): string {
  if (!usage) return "";
  if (usage.totalTokens) return `${usage.totalTokens} tokens`;
  if (usage.completionTokens) return `${usage.completionTokens} tokens（输出）`;
  return "";
}

export function MessageItem({
  exchange,
  onRetry,
  onStop,
  canRetry,
}: {
  exchange: Exchange;
  onRetry: () => void;
  onStop: () => void;
  canRetry: boolean;
}) {
  const task = getTaskType(exchange.task);
  const isStreaming = exchange.status === "streaming";
  const meta = [exchange.model, formatDuration(exchange.latencyMs), formatTokens(exchange.usage)].filter(
    Boolean,
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap">
          {exchange.prompt}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" />
          <span>{task.label}</span>
          <span aria-hidden>·</span>
          <span>{getLanguageLabel(exchange.language)}</span>
          {exchange.status === "canceled" ? (
            <Badge variant="outline" className="ml-1 font-normal">
              已停止
            </Badge>
          ) : null}
          {exchange.context?.truncated ? (
            <Badge variant="outline" className="font-normal">
              上下文已裁剪 · 保留 {exchange.context.messages} 条
            </Badge>
          ) : null}
        </div>

        <div className="rounded-lg border bg-card p-3">
          {exchange.output ? (
            <MarkdownRenderer content={exchange.output} />
          ) : isStreaming ? (
            <div className="space-y-2 py-1">
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ) : null}

          {isStreaming ? (
            <span
              aria-hidden
              className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-foreground/70 align-text-bottom"
            />
          ) : null}

          {exchange.status === "error" && exchange.error ? (
            <Alert variant="destructive" className="mt-3">
              <AlertCircle />
              <AlertTitle>生成失败（{exchange.error.code}）</AlertTitle>
              <AlertDescription>
                <p>{exchange.error.message}</p>
                {ERROR_HINTS[exchange.error.code] ? (
                  <p className="mt-1 text-xs opacity-80">{ERROR_HINTS[exchange.error.code]}</p>
                ) : null}
                {exchange.error.issues?.length ? (
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    {exchange.error.issues.map((issue) => (
                      <li key={`${issue.path}-${issue.message}`}>
                        {issue.path}：{issue.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div
            className={cn(
              "mt-3 flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-muted-foreground",
              isStreaming && "justify-between",
            )}
          >
            {isStreaming ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  正在生成…
                </span>
                <Button variant="outline" size="xs" onClick={onStop}>
                  <Square data-icon="inline-start" />
                  停止
                </Button>
              </>
            ) : (
              <>
                {meta.length > 0 ? <span className="font-mono">{meta.join(" · ")}</span> : <span />}
                <div className="ml-auto flex items-center gap-1">
                  {canRetry ? (
                    <Button variant="ghost" size="xs" onClick={onRetry}>
                      <RefreshCw data-icon="inline-start" />
                      重新生成
                    </Button>
                  ) : null}
                  {exchange.output ? <CopyButton text={exchange.output} /> : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
