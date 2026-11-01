"use client";

import { useCallback, useRef, useState } from "react";

import { streamAiTask, type StreamError, type StreamUsage } from "@/lib/ai-client/stream";import type { Language, TaskType } from "@/lib/constants";

export type ExchangeStatus = "streaming" | "done" | "error" | "canceled";

export type Exchange = {
  id: string;
  task: TaskType;
  language: Language;
  /** 用户提交的原文，用于回显与"重新生成" */
  prompt: string;
  /** 实际发送的请求体，重新生成时原样复用 */
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
  requestBody: unknown;
};

export type UseAiTask = {
  exchanges: Exchange[];
  isStreaming: boolean;
  run: (input: StartInput) => Promise<void>;
  stop: () => void;
  retry: () => void;
  reset: () => void;
};

export function useAiTask(): UseAiTask {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  // 用 ref 而不是 state 保存控制器：它不参与渲染，且需要在回调里同步判断
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

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
        body: input.requestBody,
        signal: controller.signal,
        onMeta: (meta) =>
          patch(id, (item) => ({
            ...item,
            context: meta.context,
            model: meta.model || item.model,
          })),
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
    if (!last || last.status === "streaming") return;
    void execute({
      task: last.task,
      language: last.language,
      prompt: last.prompt,
      requestBody: last.requestBody,
    });
  }, [exchanges, execute]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setExchanges([]);
  }, []);

  const isStreaming = exchanges.some((item) => item.status === "streaming");

  return { exchanges, isStreaming, run, stop, retry, reset };
}
