"use client";

import type { SnippetRow } from "@/lib/db/types";

type ErrorResponse = { error?: { message?: string } };

export type CreateSnippetInput = {
  title: string;
  language: string;
  code: string;
  description?: string | null;
  sourceMessageId?: string | null;
};

/**
 * 片段写入的唯一客户端入口。
 * useSnippets 与工作台的「保存片段」都调它，避免两处各写一份 fetch。
 */
export async function createSnippetRequest(input: CreateSnippetInput): Promise<SnippetRow> {
  const response = await fetch("/api/snippets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as ErrorResponse;
    throw new Error(data.error?.message ?? "保存失败");
  }

  const data = (await response.json()) as { snippet: SnippetRow };
  return data.snippet;
}
