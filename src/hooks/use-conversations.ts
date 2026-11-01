"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationSummary } from "@/lib/db/types";

type ListResponse = { conversations: ConversationSummary[] };
type ErrorResponse = { error?: { message?: string } };

export type UseConversations = {
  items: ConversationSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/** 纯取数，不碰 React 状态，便于在 effect 与手动刷新两处复用。 */
async function fetchConversations(limit: number): Promise<ConversationSummary[]> {
  const response = await fetch(`/api/conversations?limit=${limit}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`加载会话列表失败（HTTP ${response.status}）`);
  const data = (await response.json()) as ListResponse;
  return data.conversations ?? [];
}

export function useConversations(limit = 20): UseConversations {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 卸载后不再 setState：切换页面时 fetch 可能才刚返回
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 首屏加载放在 async IIFE 里：setState 在 await 之后执行，
  // 不会触发“在 effect 中同步 setState”的级联渲染问题。
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const list = await fetchConversations(limit);
        if (cancelled) return;
        setItems(list);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "加载会话列表失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchConversations(limit);
      if (!aliveRef.current) return;
      setItems(list);
      setError(null);
    } catch (cause) {
      if (!aliveRef.current) return;
      setError(cause instanceof Error ? cause.message : "加载会话列表失败");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [limit]);

  const rename = useCallback(async (id: string, title: string) => {
    const response = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as ErrorResponse;
      throw new Error(data.error?.message ?? "重命名失败");
    }

    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, title } : item)));
  }, []);

  const remove = useCallback(async (id: string) => {
    const response = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      const data = (await response.json().catch(() => ({}))) as ErrorResponse;
      throw new Error(data.error?.message ?? "删除失败");
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { items, isLoading, error, refresh, rename, remove };
}
