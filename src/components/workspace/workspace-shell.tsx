"use client";

import { useRef, useState } from "react";
import { Menu, Trash2 } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConversationView } from "@/components/workspace/conversation-view";
import { ResultPanel } from "@/components/workspace/result-panel";
import { SessionSidebar } from "@/components/workspace/session-sidebar";
import { TaskComposer } from "@/components/workspace/task-composer";
import { useAiTask } from "@/hooks/use-ai-task";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_TASK_TYPE,
  type Language,
  type RefactorGoal,
  type TaskType,
} from "@/lib/constants";

const DEFAULT_GOALS: RefactorGoal[] = ["naming", "split", "readability"];

type HistoryItem = { role: "user" | "assistant"; content: string };

export function WorkspaceShell() {
  const [mode, setMode] = useState<TaskType>(DEFAULT_TASK_TYPE);
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [prompt, setPrompt] = useState("");
  const [errorText, setErrorText] = useState("");
  const [constraint, setConstraint] = useState("");
  const [goals, setGoals] = useState<RefactorGoal[]>(DEFAULT_GOALS);
  const [navOpen, setNavOpen] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const { exchanges, isStreaming, run, stop, retry, reset } = useAiTask();

  function handlePickExample(nextMode: TaskType, nextPrompt: string) {
    setMode(nextMode);
    setPrompt(nextPrompt);
    // 等 React 把新值写进 DOM 后再聚焦，否则光标会落在旧内容末尾。
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  /**
   * 把当前对话压成历史消息。
   * 客户端只做粗裁（最近 12 条），精确的预算裁剪切在服务端，避免两处规则不一致。
   */
  function buildHistory(): HistoryItem[] {
    const items: HistoryItem[] = [];
    for (const exchange of exchanges) {
      if (!exchange.output.trim()) continue;
      items.push({ role: "user", content: exchange.prompt });
      items.push({ role: "assistant", content: exchange.output });
    }
    return items.slice(-12);
  }

  /** 四类任务的请求体形状不同，统一在这里构造，组件只负责展示。 */
  function buildRequestBody() {
    const history = buildHistory();

    switch (mode) {
      case "generate":
        return {
          prompt: prompt.trim(),
          language,
          history,
          ...(constraint.trim() ? { constraint: constraint.trim() } : {}),
        };
      case "explain":
        return { code: prompt, language, history };
      case "debug":
        return { code: prompt, errorText, language, history };
      case "refactor":
        return { code: prompt, language, goals, history };
    }
  }

  function handleSubmit() {
    if (isStreaming) return;
    const display = prompt.trim();
    if (!display) return;

    void run({
      task: mode,
      language,
      prompt: display,
      requestBody: buildRequestBody(),
    });

    setPrompt("");
    setErrorText("");
  }

  const lastExchange = exchanges.at(-1);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="打开会话列表"
          onClick={() => setNavOpen(true)}
        >
          <Menu />
        </Button>

        <Brand />
        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
        <span className="hidden text-sm text-muted-foreground sm:inline">工作台</span>
        <Badge variant="outline" className="ml-1 hidden font-normal sm:inline-flex">
          单用户模式
        </Badge>

        <div className="ml-auto flex items-center gap-1">
          {exchanges.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="清空当前对话"
                  onClick={reset}
                  disabled={isStreaming}
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>清空当前对话（未保存的内容会丢失）</TooltipContent>
            </Tooltip>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden min-h-0 w-60 shrink-0 overflow-hidden border-r md:block lg:w-64">
          <SessionSidebar />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ConversationView
            exchanges={exchanges}
            isStreaming={isStreaming}
            onPickExample={handlePickExample}
            onRetry={retry}
            onStop={stop}
          />
          <TaskComposer
            mode={mode}
            onModeChange={setMode}
            language={language}
            onLanguageChange={setLanguage}
            prompt={prompt}
            onPromptChange={setPrompt}
            errorText={errorText}
            onErrorTextChange={setErrorText}
            constraint={constraint}
            onConstraintChange={setConstraint}
            goals={goals}
            onGoalsChange={setGoals}
            promptRef={promptRef}
            isStreaming={isStreaming}
            onSubmit={handleSubmit}
            onStop={stop}
          />
        </main>

        <aside className="hidden w-[22rem] shrink-0 border-l lg:block xl:w-[25rem]">
          <ResultPanel exchange={lastExchange} />
        </aside>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b p-3">
            <SheetTitle className="text-sm">会话</SheetTitle>
            <SheetDescription className="sr-only">会话列表与历史记录</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <SessionSidebar />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
