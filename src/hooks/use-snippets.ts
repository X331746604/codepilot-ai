"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createSnippetRequest } from "@/lib/api-client/snippets";
import type { SnippetRow } from "@/lib/db/types";

type ListResponse = { snippets: SnippetRow[] };
type ErrorResponse = { error?: { message?: string } };

export type UseSnippets = {
  items: SnippetRow[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
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

async function fetchSnippets(q: string, language: string): Promise<SnippetRow[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (language) params.set("language", language);

  const response = await fetch(`/api/snippets?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`加载片段失败（HTTP ${response.status}）`);
  const data = (await response.json()) as ListResponse;
  return data.snippets ?? [];
}

export function useSnippets({ q, language }: { q: string; language: string }): UseSnippets {
  const [items, setItems] = useState<SnippetRow[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 首屏与筛选条件变化时重新取数；setState 都在 await 之后，避免同步级联渲染
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const list = await fetchSnippets(q, language);
        if (cancelled) return;
        setItems(list);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "加载片段失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [q, language]);

  const reload = useCallback(async () => {
    try {
      const list = await fetchSnippets(q, language);
      if (!aliveRef.current) return;
      setItems(list);
      setError(null);
    } catch (cause) {
      if (!aliveRef.current) return;
      setError(cause instanceof Error ? cause.message : "加载片段失败");
    }
  }, [q, language]);

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

  return { items, isLoading, error, reload, create, update, remove };
}
