"use client";

import { useRef, useState } from "react";
import { Menu } from "lucide-react";

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
import { ConversationPanel } from "@/components/workspace/conversation-panel";
import { ResultPanel } from "@/components/workspace/result-panel";
import { SessionSidebar } from "@/components/workspace/session-sidebar";
import { TaskComposer } from "@/components/workspace/task-composer";
import { DEFAULT_LANGUAGE, DEFAULT_TASK_TYPE, type Language, type TaskType } from "@/lib/constants";

export function WorkspaceShell() {
  const [mode, setMode] = useState<TaskType>(DEFAULT_TASK_TYPE);
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [prompt, setPrompt] = useState("");
  const [errorText, setErrorText] = useState("");
  const [constraint, setConstraint] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement>(null);

  function handlePickExample(nextMode: TaskType, nextPrompt: string) {
    setMode(nextMode);
    setPrompt(nextPrompt);
    // 等 React 把新值写进 DOM 后再聚焦，否则光标会落在旧内容末尾。
    requestAnimationFrame(() => promptRef.current?.focus());
  }

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
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden min-h-0 w-60 shrink-0 overflow-hidden border-r md:block lg:w-64">
          <SessionSidebar />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ConversationPanel onPickExample={handlePickExample} />
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
            promptRef={promptRef}
          />
        </main>

        <aside className="hidden w-[22rem] shrink-0 border-l lg:block xl:w-[25rem]">
          <ResultPanel />
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
