"use client";

import { useCallback, useRef, useState } from "react";

import { streamAiTask, type StreamError, type StreamUsage } from "@/lib/ai-client/stream";
import type { Language, TaskType } from "@/lib/constants";

export type ExchangeStatus = "streaming" | "done" | "error" | "canceled";

export type Exchange = {
  id: string;
  task: TaskType;
  language: Language;
  /** 用户提交的原文，用于回显与"重新生成" */
  prompt: string;
  /** 实际发送的请求体；从数据库恢复的历史消息为 null（不可重新生成） */
  requestBody: unknown;
  output: string;
  status: ExchangeStatus;
  error?: StreamError;
  usage: StreamUsage | null;
  model?: string;
  latencyMs?: number;
  /** 服务端返回的上下文使用情况，truncated 为真时界面提示已裁剪 */
  context?: { messages: number; truncated: boolean };
  createdAt: number;
};

export type StartInput = {
  task: TaskType;
  language: Language;
  prompt: string;
  /** 由调用方构造；会话 ID 不放在这里，由 hook 自己补 */
  requestBody: Record<string, unknown>;
};

/** 与 GET /api/conversations/[id]/messages 返回的消息结构对应 */
type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  task_type: TaskType;
  language: Language;
  status: "ok" | "partial" | "error";
  usage: StreamUsage | null;
  latency_ms: number | null;
  created_at: string;
};

/** 把数据库里交错的消息还原成"一问一答"的交换列表。 */
function rowsToExchanges(rows: MessageRow[]): Exchange[] {
  const exchanges: Exchange[] = [];
  let current: Exchange | null = null;

  for (const row of rows) {
    if (row.role === "user") {
      current = {
        id: row.id,
        task: row.task_type,
        language: row.language,
        prompt: row.content,
        requestBody: null,
        output: "",
        status: "done",
        usage: null,
        createdAt: new Date(row.created_at).getTime(),
      };
      exchanges.push(current);
      continue;
    }

    // 没有对应的用户消息（例如手工插入的数据）时，单独作为一条记录展示
    if (!current) {
      current = {
        id: row.id,
        task: row.task_type,
        language: row.language,
        prompt: "",
        requestBody: null,
        output: row.content,
        status: row.status === "ok" ? "done" : "canceled",
        usage: row.usage,
        latencyMs: row.latency_ms ?? undefined,
        createdAt: new Date(row.created_at).getTime(),
      };
      exchanges.push(current);
      current = null;
      continue;
    }

    current.output = row.content;
    current.status = row.status === "ok" ? "done" : row.status === "partial" ? "canceled" : "error";
    current.usage = row.usage;
    current.latencyMs = row.latency_ms ?? undefined;
    current = null;
  }

  return exchanges;
}

export type UseAiTask = {
  exchanges: Exchange[];
  isStreaming: boolean;
  conversationId: string | null;
  isLoadingConversation: boolean;
  run: (input: StartInput) => Promise<void>;
  stop: () => void;
  retry: () => void;
  reset: () => void;
  openConversation: (id: string) => Promise<void>;
};

export function useAiTask(): UseAiTask {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingConversation, setLoadingConversation] = useState(false);

  // 用 ref 而不是 state 保存控制器：它不参与渲染，且需要在回调里同步判断
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  // 会话 ID 同时存一份 ref：execute 里要读最新值，而 state 在闭包里可能是旧的
  const conversationRef = useRef<string | null>(null);

  const patch = useCallback((id: string, updater: (item: Exchange) => Exchange) => {
    setExchanges((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
  }, []);

  const execute = useCallback(
    async (input: StartInput) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const id = crypto.randomUUID();
      const controller = new AbortController();
      controllerRef.current = controller;
      const startedAt = performance.now();

      setExchanges((prev) => [
        ...prev,
        {
          id,
          task: input.task,
          language: input.language,
          prompt: input.prompt,
          requestBody: input.requestBody,
          output: "",
          status: "streaming",
          usage: null,
          createdAt: Date.now(),
        },
      ]);

      const result = await streamAiTask({
        task: input.task,
        body: {
          ...input.requestBody,
          ...(conversationRef.current ? { conversationId: conversationRef.current } : {}),
        },
        signal: controller.signal,
        onMeta: (meta) => {
          if (meta.conversationId && meta.conversationId !== conversationRef.current) {
            conversationRef.current = meta.conversationId;
            setConversationId(meta.conversationId);
          }
          patch(id, (item) => ({
            ...item,
            context: meta.context,
            model: meta.model || item.model,
          }));
        },
        onDelta: (text) => patch(id, (item) => ({ ...item, output: item.output + text })),
      });

      const latencyMs = Math.round(performance.now() - startedAt);

      if (result.ok) {
        patch(id, (item) => ({
          ...item,
          status: "done",
          usage: result.usage,
          model: result.model || item.model,
          latencyMs,
        }));
      } else {
        patch(id, (item) => ({
          ...item,
          status: result.error.code === "CANCELED" ? "canceled" : "error",
          error: result.error,
          latencyMs,
        }));
      }

      controllerRef.current = null;
      inFlightRef.current = false;
    },
    [patch],
  );

  const run = useCallback(
    async (input: StartInput) => {
      await execute(input);
    },
    [execute],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    const last = exchanges.at(-1);
    if (!last || last.status === "streaming" || !last.requestBody) return;
    void execute({
      task: last.task,
      language: last.language,
      prompt: last.prompt,
      requestBody: last.requestBody as Record<string, unknown>,
    });
  }, [exchanges, execute]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    conversationRef.current = null;
    setConversationId(null);
    setExchanges([]);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    controllerRef.current?.abort();
    setLoadingConversation(true);
    try {
      const response = await fetch(`/api/conversations/${id}/messages`, { cache: "no-store" });
      if (!response.ok) throw new Error(`加载会话失败（HTTP ${response.status}）`);
      const data = (await response.json()) as { messages: MessageRow[] };
      conversationRef.current = id;
      setConversationId(id);
      setExchanges(rowsToExchanges(data.messages ?? []));
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  const isStreaming = exchanges.some((item) => item.status === "streaming");

  return {
    exchanges,
    isStreaming,
    conversationId,
    isLoadingConversation,
    run,
    stop,
    retry,
    reset,
    openConversation,
  };
}
