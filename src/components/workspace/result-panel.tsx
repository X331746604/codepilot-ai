"use client";

import { FileCode } from "lucide-react";

import { CodeBlock } from "@/components/code/code-block";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Exchange } from "@/hooks/use-ai-task";
import { getTaskType } from "@/lib/constants";
import { extractCodeBlocks } from "@/lib/markdown/extract-code";

export function ResultPanel({ exchange }: { exchange?: Exchange }) {
  const blocks = exchange ? extractCodeBlocks(exchange.output) : [];

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-sm font-medium">代码</span>
        <Badge variant="outline" className="ml-auto text-[10px] font-normal">
          {blocks.length > 0 ? `${blocks.length} 段` : "空"}
        </Badge>
      </div>

      {blocks.length > 0 ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            {exchange ? (
              <p className="text-xs text-muted-foreground">
                {getTaskType(exchange.task).label} ·{" "}
                {exchange.status === "streaming" ? "生成中" : "已完成"}
              </p>
            ) : null}
            {blocks.map((block, index) => (
              <CodeBlock
                key={`${block.language}-${index}`}
                code={block.code}
                language={block.language}
                className="my-0"
              />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <FileCode className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">还没有代码</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {exchange
              ? "这次回答里没有代码块，结论在左侧正文中。"
              : "提交任务后，回答中的代码会单独显示在这里，方便对照与复制。"}
          </p>
        </div>
      )}
    </div>
  );
}
