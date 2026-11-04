"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Ellipsis,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONVERSATION_RANGES, LIMITS, type ConversationRange } from "@/lib/constants";
import type { ConversationSummary } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type SessionSidebarProps = {
  items: ConversationSummary[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  query: string;
  range: ConversationRange;
  activeId: string | null;
  onQueryChange: (value: string) => void;
  onRangeChange: (value: ConversationRange) => void;
  onLoadMore: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function formatRelative(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";

  const diff = Date.now() - time;
  const minute = 60_000;
  if (diff < minute) return "刚刚";
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`;
  if (diff < 7 * 24 * 60 * minute) return `${Math.floor(diff / (24 * 60 * minute))} 天前`;

  const date = new Date(time);
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")}`;
}

export function SessionSidebar({
  items,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  query,
  range,
  activeId,
  onQueryChange,
  onRangeChange,
  onLoadMore,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: SessionSidebarProps) {
  const [renameTarget, setRenameTarget] = useState<ConversationSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const [pending, setPending] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filtering = query.trim().length > 0 || range !== "all";

  /**
   * 触底自动加载。
   *
   * IntersectionObserver 会考虑祖先元素的裁剪，所以即使哨兵在
   * `overflow-y-auto` 容器里滚出可视区，也不会被判为"可见"。
   * onLoadMore 是 useCallback 稳定的，因此依赖收窄到三个布尔/回调即可。
   */
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || isLoadingMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "120px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isLoading, onLoadMore]);

  async function handleRename() {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title) {
      toast.error("标题不能为空");
      return;
    }

    setPending(true);
    try {
      await onRename(renameTarget.id, title);
      toast.success("已重命名");
      setRenameTarget(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "重命名失败");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setPending(true);
    try {
      await onDelete(deleteTarget.id);
      toast.success("会话已删除");
      setDeleteTarget(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="space-y-2 p-3 pb-2">
        <Button variant="outline" className="w-full justify-start gap-2" onClick={onNew}>
          <Plus data-icon="inline-start" />
          新建会话
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索会话标题"
            aria-label="搜索会话标题"
            className="h-8 pl-7 text-xs"
          />
        </div>

        <div className="flex gap-1" role="group" aria-label="按时间范围筛选会话">
          {CONVERSATION_RANGES.map((item) => (
            <Button
              key={item.value}
              type="button"
              size="xs"
              variant={range === item.value ? "secondary" : "ghost"}
              aria-pressed={range === item.value}
              className={cn(
                "flex-1 px-1 text-[11px]",
                // ghost 在浅色底上几乎没有轮廓，未选中项压成次要色才看得出层级
                range === item.value ? "font-medium text-foreground" : "text-muted-foreground",
              )}
              onClick={() => onRangeChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            加载中
          </div>
        ) : error ? (
          <p className="px-3 py-6 text-center text-xs leading-relaxed text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MessageSquare className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">{filtering ? "没有匹配的会话" : "还没有会话"}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {filtering
                ? "换个关键词，或把时间范围切回「全部」。"
                : "发送第一条消息后，会话会自动出现在这里。"}
            </p>
            {filtering ? (
              <Button
                variant="outline"
                size="xs"
                className="mt-1"
                onClick={() => {
                  onQueryChange("");
                  onRangeChange("all");
                }}
              >
                清除筛选
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <ul className={cn("space-y-0.5 transition-opacity", isLoading && "opacity-50")}>
              {items.map((item) => {
                const active = item.id === activeId;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "group flex items-center rounded-md transition-colors",
                      active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="block truncate text-sm">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {formatRelative(item.last_message_at)}
                      </span>
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="会话操作"
                          className="mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem
                          onSelect={() => {
                            setRenameTarget(item);
                            setRenameValue(item.title);
                          }}
                        >
                          <Pencil className="size-4" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(item)}>
                          <Trash2 className="size-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>

            {/* 哨兵：进入可视区即加载下一页；同时作为"是否还有更多"的视觉提示 */}
            <div ref={sentinelRef} className="py-2 text-center">
              {isLoadingMore ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <LoaderCircle className="size-3 animate-spin" />
                  加载更多
                </span>
              ) : hasMore ? (
                <span className="text-[11px] text-muted-foreground">向下滚动加载更多</span>
              ) : items.length > 6 ? (
                <span className="text-[11px] text-muted-foreground">已到末尾</span>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 space-y-1.5 border-t p-3">
        <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-2">
          <Link href="/snippets">
            <Bookmark className="size-4" />
            代码片段
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-2">
          <Link href="/settings">
            <Settings className="size-4" />
            设置
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">数据按账号隔离 · 仅自己可见</p>
      </div>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>最多 {LIMITS.conversationTitle} 个字符。</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-title" className="sr-only">
              会话标题
            </Label>
            <Input
              id="rename-title"
              value={renameValue}
              maxLength={LIMITS.conversationTitle}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)} disabled={pending}>
              取消
            </Button>
            <Button onClick={() => void handleRename()} disabled={pending}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除这个会话？</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.title}」及其全部消息会被永久删除，无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={pending}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={pending}>
              {pending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
