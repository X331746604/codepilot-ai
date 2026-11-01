"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createSnippetRequest } from "@/lib/api-client/snippets";
import type { SnippetRow } from "@/lib/db/types";

type ListResponse = { snippets: SnippetRow[]; nextCursor?: string | null };
type ErrorResponse = { error?: { message?: string } };

export type UseSnippets = {
  items: SnippetRow[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => void;
  create: (input: {
    title: string;
    language: string;
    code: string;
    description?: string | null;
    sourceMessageId?: string | null;
  }) => Promise<SnippetRow>;
  update: (
    id: string,
    patch: { title?: string; language?: string; code?: string; description?: string | null },
  ) => Promise<SnippetRow>;
  remove: (id: string) => Promise<void>;
};

const PAGE_SIZE = 12;

async function fetchSnippets(input: {
  q: string;
  language: string;
  cursor?: string | null;
}): Promise<{ items: SnippetRow[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.language) params.set("language", input.language);
  if (input.cursor) params.set("cursor", input.cursor);

  const response = await fetch(`/api/snippets?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`加载片段失败（HTTP ${response.status}）`);

  const data = (await response.json()) as ListResponse;
  return { items: data.snippets ?? [], nextCursor: data.nextCursor ?? null };
}

export function useSnippets({ q, language }: { q: string; language: string }): UseSnippets {
  const [items, setItems] = useState<SnippetRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 加载态由「条件指纹」推导，理由同 use-conversations：避免在 effect 里同步 setState
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const key = `${q}\u0000${language}`;

  // 首屏与筛选条件变化时重新取数；setState 都在 await 之后，避免同步级联渲染
  useEffect(() => {
    let cancelled = false;
    const requestKey = `${q}\u0000${language}`;

    void (async () => {
      try {
        const page = await fetchSnippets({ q, language });
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setItems([]);
        setCursor(null);
        setError(cause instanceof Error ? cause.message : "加载片段失败");
      } finally {
        if (!cancelled) setLoadedKey(requestKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [q, language]);

  const reload = useCallback(async () => {
    try {
      const page = await fetchSnippets({ q, language });
      if (!aliveRef.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      if (!aliveRef.current) return;
      setError(cause instanceof Error ? cause.message : "加载片段失败");
    }
  }, [q, language]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    void (async () => {
      try {
        const page = await fetchSnippets({ q, language, cursor });
        if (!aliveRef.current) return;

        setItems((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...page.items.filter((item) => !seen.has(item.id))];
        });
        setCursor(page.nextCursor && page.nextCursor !== cursor ? page.nextCursor : null);
      } catch (cause) {
        if (aliveRef.current) {
          setError(cause instanceof Error ? cause.message : "加载更多失败");
        }
      } finally {
        loadingMoreRef.current = false;
        if (aliveRef.current) setLoadingMore(false);
      }
    })();
  }, [cursor, q, language]);

  const create = useCallback<UseSnippets["create"]>(async (input) => {
    const snippet = await createSnippetRequest(input);
    // 新建的片段按创建时间倒序应排在最前
    setItems((prev) => [snippet, ...prev]);
    return snippet;
  }, []);

  const update = useCallback<UseSnippets["update"]>(async (id, patch) => {
    const response = await fetch(`/api/snippets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as ErrorResponse;
      throw new Error(data.error?.message ?? "更新失败");
    }
    const data = (await response.json()) as { snippet: SnippetRow };
    setItems((prev) => prev.map((item) => (item.id === id ? data.snippet : item)));
    return data.snippet;
  }, []);

  const remove = useCallback(async (id: string) => {
    const response = await fetch(`/api/snippets/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      const data = (await response.json().catch(() => ({}))) as ErrorResponse;
      throw new Error(data.error?.message ?? "删除失败");
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return {
    items,
    isLoading: loadedKey !== key,
    isLoadingMore,
    hasMore: cursor !== null,
    error,
    reload,
    loadMore,
    create,
    update,
    remove,
  };
}
