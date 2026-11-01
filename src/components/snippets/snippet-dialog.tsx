"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getLanguageLabel, LANGUAGES, LIMITS } from "@/lib/constants";

export type SnippetDraft = {
  title: string;
  language: string;
  description: string;
  code: string;
};

type SnippetDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initial: SnippetDraft;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: SnippetDraft) => Promise<void>;
};

export function SnippetDialog({
  open,
  mode,
  initial,
  pending,
  onOpenChange,
  onSubmit,
}: SnippetDialogProps) {
  const [draft, setDraft] = useState<SnippetDraft>(initial);

  const titleMissing = draft.title.trim().length === 0;
  const codeMissing = draft.code.trim().length === 0;
  const canSubmit = !titleMissing && !codeMissing && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "保存代码片段" : "编辑代码片段"}</DialogTitle>
          <DialogDescription>
            片段独立于会话保存，之后可以在「代码片段」页搜索与复用。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="snippet-title">标题</Label>
              <Input
                id="snippet-title"
                value={draft.title}
                maxLength={LIMITS.snippetTitle}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="例如：useDebounce Hook"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="snippet-language">语言</Label>
              <Select
                value={draft.language}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, language: value }))}
              >
                <SelectTrigger id="snippet-language" className="w-full">
                  <SelectValue>{getLanguageLabel(draft.language)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="snippet-code">代码</Label>
            <Textarea
              id="snippet-code"
              value={draft.code}
              onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
              aria-invalid={codeMissing}
              className="max-h-72 min-h-40 resize-y font-mono text-xs"
              placeholder="粘贴或输入代码"
            />
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {draft.code.length} / {LIMITS.snippetCode}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="snippet-desc">描述（选填）</Label>
            <Input
              id="snippet-desc"
              value={draft.description}
              maxLength={LIMITS.snippetDescription}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="这段代码解决什么问题、有什么注意事项"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button
            onClick={() => void onSubmit(draft)}
            disabled={!canSubmit}
            title={titleMissing ? "请填写标题" : codeMissing ? "请填写代码" : undefined}
          >
            {pending ? "保存中…" : mode === "create" ? "保存片段" : "保存修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
