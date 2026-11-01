"use client";

import { useEffect, useRef } from "react";

import { MessageItem } from "@/components/chat/message-item";
import { ConversationEmptyState } from "@/components/workspace/conversation-panel";
import type { Exchange } from "@/hooks/use-ai-task";
import type { TaskType } from "@/lib/constants";

type ConversationViewProps = {
  exchanges: Exchange[];
  isStreaming: boolean;
  onPickExample: (mode: TaskType, prompt: string) => void;
  onRetry: () => void;
  onStop: () => void;
  onSaveSnippet: (exchange: Exchange) => void;
};

export function ConversationView({
  exchanges,
  isStreaming,
  onPickExample,
  onRetry,
  onStop,
  onSaveSnippet,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 只有用户本来就贴着底部时才自动跟随；否则会把正在往回翻的人拽回底部。
  const stickToBottom = useRef(true);
  const lastLength = exchanges.at(-1)?.output.length ?? 0;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !stickToBottom.current) return;
    element.scrollTop = element.scrollHeight;
  }, [exchanges.length, lastLength]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottom.current = distance < 80;
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
      {exchanges.length === 0 ? (
        <ConversationEmptyState onPickExample={onPickExample} />
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
          {exchanges.map((exchange, index) => (
            <MessageItem
              key={exchange.id}
              exchange={exchange}
              onRetry={onRetry}
              onStop={onStop}
              onSaveSnippet={onSaveSnippet}
              canRetry={
                index === exchanges.length - 1 &&
                !isStreaming &&
                exchange.status !== "done" &&
                exchange.status !== "streaming"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
