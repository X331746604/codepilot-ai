"use client";

import type { RefObject } from "react";
import { ArrowUp, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getLanguageLabel,
  getTaskType,
  LANGUAGES,
  LIMITS,
  REFACTOR_GOALS,
  TASK_TYPES,
  type Language,
  type RefactorGoal,
  type TaskType,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

type TaskComposerProps = {
  mode: TaskType;
  onModeChange: (mode: TaskType) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  errorText: string;
  onErrorTextChange: (value: string) => void;
  constraint: string;
  onConstraintChange: (value: string) => void;
  goals: RefactorGoal[];
  onGoalsChange: (goals: RefactorGoal[]) => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  isStreaming: boolean;
  onSubmit: () => void;
  onStop: () => void;
};

export function TaskComposer({
  mode,
  onModeChange,
  language,
  onLanguageChange,
  prompt,
  onPromptChange,
  errorText,
  onErrorTextChange,
  constraint,
  onConstraintChange,
  goals,
  onGoalsChange,
  promptRef,
  isStreaming,
  onSubmit,
  onStop,
}: TaskComposerProps) {
  const task = getTaskType(mode);
  const needsCode = mode !== "generate";
  const promptLimit = needsCode ? LIMITS.code : LIMITS.prompt;

  const promptOverLimit = prompt.length > promptLimit;
  const errorMissing = mode === "debug" && errorText.trim().length === 0;
  const goalsMissing = mode === "refactor" && goals.length === 0;
  const empty = prompt.trim().length === 0;
  const canSubmit = !isStreaming && !empty && !promptOverLimit && !errorMissing && !goalsMissing;
  const hasInput = prompt.length > 0 || errorText.length > 0 || constraint.length > 0;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  const hint = empty
    ? "输入内容后即可发送"
    : promptOverLimit
      ? `超出上限 ${prompt.length - promptLimit} 字，请精简后再发送`
      : errorMissing
        ? "调试任务需要提供报错信息"
        : goalsMissing
          ? "至少选择一个重构目标"
          : null;

  function toggleGoal(goal: RefactorGoal) {
    if (goals.includes(goal)) {
      if (goals.length === 1) return; // 至少保留一项
      onGoalsChange(goals.filter((item) => item !== goal));
      return;
    }
    onGoalsChange([...goals, goal]);
  }

  return (
    <div className="shrink-0 border-t bg-background px-3 py-3 sm:px-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Tabs
            value={mode}
            onValueChange={(value) => onModeChange(value as TaskType)}
          >
            <TabsList aria-label="任务类型">
              {TASK_TYPES.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  disabled={isStreaming}
                  className="px-2.5 text-xs sm:text-sm"
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="ml-auto flex items-center gap-1.5">
            <Label htmlFor="composer-language" className="sr-only">
              编程语言
            </Label>
            <Select value={language} onValueChange={(value) => onLanguageChange(value as Language)}>
              <SelectTrigger id="composer-language" size="sm" className="w-[7.5rem]">
                <SelectValue>{getLanguageLabel(language)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="清空输入"
                    disabled={!hasInput || isStreaming}
                    onClick={() => {
                      onPromptChange("");
                      onErrorTextChange("");
                      onConstraintChange("");
                    }}
                  >
                    <X />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>清空当前输入</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {mode === "debug" ? (
          <div className="mb-2">
            <Label htmlFor="composer-error" className="mb-1 text-xs text-muted-foreground">
              报错信息（必填）
            </Label>
            <Textarea
              id="composer-error"
              value={errorText}
              onChange={(event) => onErrorTextChange(event.target.value)}
              placeholder="粘贴完整报错，包括错误类型、消息与堆栈首行。"
              maxLength={LIMITS.errorText}
              disabled={isStreaming}
              aria-invalid={errorMissing && errorText.length > 0}
              className="max-h-32 min-h-16 resize-none font-mono text-xs"
            />
            <p className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>没有报错信息时，分析只能靠猜——请尽量补全。</span>
              <span className="tabular-nums">
                {errorText.length} / {LIMITS.errorText}
              </span>
            </p>
          </div>
        ) : null}

        {mode === "refactor" ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">重构目标</span>
            {REFACTOR_GOALS.map((goal) => {
              const active = goals.includes(goal.value);
              return (
                <button
                  key={goal.value}
                  type="button"
                  aria-pressed={active}
                  disabled={isStreaming}
                  onClick={() => toggleGoal(goal.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                    active
                      ? "border-transparent bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {goal.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div
          className={cn(
            "rounded-lg border bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
            promptOverLimit && "border-destructive focus-within:border-destructive",
          )}
        >
          <Label htmlFor="composer-prompt" className="sr-only">
            {task.label}输入
          </Label>
          <Textarea
            id="composer-prompt"
            ref={promptRef}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={task.placeholder}
            disabled={isStreaming}
            aria-invalid={promptOverLimit}
            className={cn(
              "max-h-40 min-h-[88px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0",
              needsCode && "font-mono text-xs sm:text-[13px]",
            )}
          />

          <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
            <span
              className={cn(
                "text-xs tabular-nums",
                promptOverLimit ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {prompt.length} / {promptLimit}
            </span>

            {isStreaming ? (
              <Button size="sm" variant="outline" onClick={onStop}>
                <Square data-icon="inline-start" />
                停止生成
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button size="sm" disabled={!canSubmit} onClick={onSubmit}>
                      <ArrowUp data-icon="inline-start" />
                      {task.submitLabel}
                    </Button>
                  </span>
                </TooltipTrigger>
                {hint ? <TooltipContent>{hint}</TooltipContent> : null}
              </Tooltip>
            )}
          </div>
        </div>

        {mode === "generate" ? (
          <div className="mt-2">
            <Label htmlFor="composer-constraint" className="sr-only">
              额外约束
            </Label>
            <Input
              id="composer-constraint"
              value={constraint}
              onChange={(event) => onConstraintChange(event.target.value)}
              maxLength={LIMITS.constraint}
              disabled={isStreaming}
              placeholder="额外约束（选填）：代码风格、依赖限制、输出要求……"
              className="h-8 text-xs"
            />
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {hint ? (
            <span className={cn(promptOverLimit && "text-destructive")}>{hint}</span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
                {isStreaming ? "正在生成，可随时停止" : "就绪"}
              </span>
              <span aria-hidden className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">Ctrl / ⌘ + Enter 发送</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
