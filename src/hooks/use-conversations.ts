"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationRange } from "@/lib/constants";
import type { ConversationSummary } from "@/lib/db/types";

type ListResponse = { conversations: ConversationSummary[]; nextCursor?: string | null };
type ErrorResponse = { error?: { message?: string } };

export type UseConversations = {
  items: ConversationSummary[];
  /** 首屏或筛选条件变化后的首次取数 */
  isLoading: boolean;
  /** 追加下一页 */
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  query: string;
  setQuery: (value: string) => void;
  range: ConversationRange;
  setRange: (value: ConversationRange) => void;
  loadMore: () => void;
  refresh: () => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

async function fetchPage(input: {
  limit: number;
  q: string;
  range: ConversationRange;
  cursor?: string | null;
}): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: String(input.limit), range: input.range });
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.cursor) params.set("cursor", input.cursor);

  const response = await fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`加载会话列表失败（HTTP ${response.status}）`);

  const data = (await response.json()) as ListResponse;
  return { items: data.conversations ?? [], nextCursor: data.nextCursor ?? null };
}

export function useConversations(limit = 20): UseConversations {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [range, setRange] = useState<ConversationRange>("all");

  /**
   * 已完成的取数对应哪个筛选条件。
   *
   * 不直接维护 `isLoading` 的布尔值，是因为在 effect 里同步 `setLoading(true)`
   * 会引入一次额外渲染（React Compiler 的 set-state-in-effect 也会拦下）。
   * 用「当前条件指纹 ≠ 已加载指纹」推导加载态，结果等价且没有额外的状态写入。
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // 卸载后不再 setState：切页面时 fetch 可能才刚返回
  const aliveRef = useRef(true);
  // loadMore 会被 IntersectionObserver 反复触发，用 ref 做同步闸门避免并发翻页
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 输入防抖：每次按键都请求会让列表在打字时不断闪烁
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const key = `${debounced}\u0000${range}\u0000${limit}`;

  useEffect(() => {
    let cancelled = false;
    const requestKey = `${debounced}\u0000${range}\u0000${limit}`;

    void (async () => {
      try {
        const page = await fetchPage({ limit, q: debounced, range });
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setItems([]);
        setCursor(null);
        setError(cause instanceof Error ? cause.message : "加载会话列表失败");
      } finally {
        // 失败也要标记：否则界面会永远停在加载态
        if (!cancelled) setLoadedKey(requestKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced, range, limit]);

  const refresh = useCallback(async () => {
    try {
      const page = await fetchPage({ limit, q: debounced, range });
      if (!aliveRef.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      if (!aliveRef.current) return;
      setError(cause instanceof Error ? cause.message : "加载会话列表失败");
    }
  }, [limit, debounced, range]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    void (async () => {
      try {
        const page = await fetchPage({ limit, q: debounced, range, cursor });
        if (!aliveRef.current) return;

        setItems((prev) => {
          // 翻页期间若有新会话写入，排序键会上移，下一页可能与已加载部分重叠。
          // 按 id 去重比"信任游标"更稳妥，代价只是一次 O(n) 遍历。
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...page.items.filter((item) => !seen.has(item.id))];
        });
        // 游标没有前进说明服务端返回了同一页，直接收口，避免无限触发
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
  }, [cursor, limit, debounced, range]);

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

  return {
    items,
    isLoading: loadedKey !== key,
    isLoadingMore,
    error,
    hasMore: cursor !== null,
    query,
    setQuery,
    range,
    setRange,
    loadMore,
    refresh,
    rename,
    remove,
  };
}
