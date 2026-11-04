"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookmarkPlus, LoaderCircle, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { UserMenu } from "@/components/auth/user-menu";
import { CopyButton } from "@/components/code/copy-button";
import { Brand } from "@/components/layout/brand";
import { SnippetDialog, type SnippetDraft } from "@/components/snippets/snippet-dialog";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLanguageLabel, LANGUAGES } from "@/lib/constants";
import type { SnippetRow } from "@/lib/db/types";
import { useSnippets } from "@/hooks/use-snippets";

const EMPTY_DRAFT: SnippetDraft = {
  title: "",
  language: "typescript",
  description: "",
  code: "",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function SnippetsView({
  userEmail,
  defaultLanguage,
}: {
  userEmail: string;
  /** 来自 profiles 表，新建片段时作为默认语言 */
  defaultLanguage: string;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [language, setLanguage] = useState("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SnippetDraft>(EMPTY_DRAFT);
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SnippetRow | null>(null);

  const { items, isLoading, isLoadingMore, hasMore, error, create, update, remove, loadMore } =
    useSnippets({
      q: debounced,
      language: language === "all" ? "" : language,
    });

  // 输入防抖：每次按键都请求一次会让列表在打字时不断闪烁
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  function openCreate() {
    setEditorMode("create");
    setEditorId(null);
    // 新建片段沿用账号的默认语言，省掉每次手动切一次
    setDraft({ ...EMPTY_DRAFT, language: defaultLanguage });
    setEditorOpen(true);
  }

  function openEdit(snippet: SnippetRow) {
    setEditorMode("edit");
    setEditorId(snippet.id);
    setDraft({
      title: snippet.title,
      language: snippet.language,
      description: snippet.description ?? "",
      code: snippet.code,
    });
    setEditorOpen(true);
  }

  async function handleSubmit(value: SnippetDraft) {
    setPending(true);
    try {
      if (editorMode === "create") {
        await create({
          title: value.title,
          language: value.language,
          code: value.code,
          description: value.description || null,
        });
        toast.success("片段已保存");
      } else if (editorId) {
        await update(editorId, {
          title: value.title,
          language: value.language,
          code: value.code,
          description: value.description || null,
        });
        toast.success("片段已更新");
      }
      setEditorOpen(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setPending(true);
    try {
      await remove(deleteTarget.id);
      toast.success("片段已删除");
      setDeleteTarget(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setPending(false);
    }
  }

  const searching = debounced.trim().length > 0 || language !== "all";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:px-6">
          <Brand />
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm whitespace-nowrap">代码片段</span>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/workspace" aria-label="返回工作台">
                <ArrowLeft data-icon="inline-start" />
                <span className="hidden sm:inline">返回工作台</span>
              </Link>
            </Button>
            <ThemeToggle />
            <UserMenu email={userEmail} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题或代码"
              aria-label="搜索片段"
              className="pl-8"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-[9rem]" aria-label="按语言筛选">
                <SelectValue>
                  {language === "all" ? "全部语言" : getLanguageLabel(language)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部语言</SelectItem>
                {LANGUAGES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={openCreate} className="shrink-0">
              <BookmarkPlus data-icon="inline-start" />
              新建片段
            </Button>
          </div>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              加载中
            </div>
          ) : error ? (
            <p className="py-16 text-center text-sm text-destructive">{error}</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <BookmarkPlus className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">
                {searching ? "没有匹配的片段" : "还没有保存过片段"}
              </p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                {searching
                  ? "换个关键词，或把语言筛选切回「全部语言」。"
                  : "在工作台里把满意的回答保存为片段，之后可以在这里搜索与复用。"}
              </p>
              {!searching ? (
                <Button variant="outline" size="sm" className="mt-2" onClick={openCreate}>
                  手动新建一个
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-2">
                {items.map((snippet) => (
                  <li key={snippet.id} className="flex flex-col rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-medium">{snippet.title}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {getLanguageLabel(snippet.language)} · {formatDate(snippet.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <CopyButton text={snippet.code} />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="编辑片段"
                          onClick={() => openEdit(snippet)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="删除片段"
                          onClick={() => setDeleteTarget(snippet)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>

                    {snippet.description ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {snippet.description}
                      </p>
                    ) : null}

                    <pre className="mt-2 max-h-28 overflow-hidden rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                      {snippet.code}
                    </pre>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-col items-center gap-2">
                {hasMore ? (
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoadingMore}>
                    {isLoadingMore ? (
                      <>
                        <LoaderCircle data-icon="inline-start" className="animate-spin" />
                        加载中…
                      </>
                    ) : (
                      "加载更多"
                    )}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">已显示全部 {items.length} 条</p>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {editorOpen ? (
        <SnippetDialog
          key={editorId ?? "new"}
          open={editorOpen}
          mode={editorMode}
          initial={draft}
          pending={pending}
          onOpenChange={setEditorOpen}
          onSubmit={handleSubmit}
        />
      ) : null}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除这个片段？</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.title}」会被永久删除，无法恢复。
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
