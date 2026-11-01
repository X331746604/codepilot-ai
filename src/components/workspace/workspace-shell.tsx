"use client";

import { useRef, useState } from "react";
import { Menu, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Brand } from "@/components/layout/brand";
import { SnippetDialog, type SnippetDraft } from "@/components/snippets/snippet-dialog";
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
import { useConversations } from "@/hooks/use-conversations";
import { createSnippetRequest } from "@/lib/api-client/snippets";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_TASK_TYPE,
  getTaskType,
  type Language,
  type RefactorGoal,
  type TaskType,
} from "@/lib/constants";
import { extractCodeBlocks } from "@/lib/markdown/extract-code";

const DEFAULT_GOALS: RefactorGoal[] = ["naming", "split", "readability"];

export function WorkspaceShell() {
  const [mode, setMode] = useState<TaskType>(DEFAULT_TASK_TYPE);
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [prompt, setPrompt] = useState("");
  const [errorText, setErrorText] = useState("");
  const [constraint, setConstraint] = useState("");
  const [goals, setGoals] = useState<RefactorGoal[]>(DEFAULT_GOALS);
  const [navOpen, setNavOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [snippetDraft, setSnippetDraft] = useState<SnippetDraft>({
    title: "",
    language: DEFAULT_LANGUAGE,
    description: "",
    code: "",
  });
  const [snippetPending, setSnippetPending] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const { exchanges, isStreaming, conversationId, run, stop, retry, reset, openConversation } =
    useAiTask();
  const conversations = useConversations();

  function handlePickExample(nextMode: TaskType, nextPrompt: string) {
    setMode(nextMode);
    setPrompt(nextPrompt);
    // 等 React 把新值写进 DOM 后再聚焦，否则光标会落在旧内容末尾。
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  /** 四类任务的请求体形状不同，统一在这里构造，组件只负责展示。 */
  function buildRequestBody() {
    switch (mode) {
      case "generate":
        return {
          prompt: prompt.trim(),
          language,
          ...(constraint.trim() ? { constraint: constraint.trim() } : {}),
        };
      case "explain":
        return { code: prompt, language };
      case "debug":
        return { code: prompt, errorText, language };
      case "refactor":
        return { code: prompt, language, goals };
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
    }).then(() => {
      // 首轮会创建会话、后续轮会更新 last_message_at，两种情况侧栏都要刷新
      void conversations.refresh();
    });

    setPrompt("");
    setErrorText("");
  }

  function handleSelectConversation(id: string) {
    setNavOpen(false);
    if (id === conversationId) return;
    void openConversation(id);
  }

  function handleNewConversation() {
    setNavOpen(false);
    reset();
    setPrompt("");
    setErrorText("");
  }

  async function handleDeleteConversation(id: string) {
    await conversations.remove(id);
    // 删掉的正是当前打开的会话时，清空工作区
    if (id === conversationId) reset();
  }

  /** 从一条回答里抽出代码，预填到保存片段的对话框。 */
  function handleSaveSnippet(exchange: (typeof exchanges)[number]) {
    const blocks = extractCodeBlocks(exchange.output);
    const first = blocks[0];
    const firstLine = exchange.prompt.split("\n")[0]?.trim().slice(0, 40) ?? "";

    setSnippetDraft({
      title: firstLine || `${getTaskType(exchange.task).label}结果`,
      language: exchange.language,
      description: "",
      code: first?.code ?? exchange.output,
    });
    setSnippetOpen(true);
  }

  async function handleSnippetSubmit(draft: SnippetDraft) {
    setSnippetPending(true);
    try {
      await createSnippetRequest({
        title: draft.title,
        language: draft.language,
        code: draft.code,
        description: draft.description || null,
        // 暂不记录 sourceMessageId：实时回答此刻还没有数据库消息 id，
        // 回填需要额外的 done 事件字段，留到任务 12 统一处理。
        sourceMessageId: null,
      });
      toast.success("片段已保存，可在「代码片段」页查看");
      setSnippetOpen(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSnippetPending(false);
    }
  }

  const lastExchange = exchanges.at(-1);

  const sidebar = (
    <SessionSidebar
      items={conversations.items}
      isLoading={conversations.isLoading}
      error={conversations.error}
      activeId={conversationId}
      onSelect={handleSelectConversation}
      onNew={handleNewConversation}
      onRename={conversations.rename}
      onDelete={handleDeleteConversation}
    />
  );

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
        <span className="hidden max-w-[14rem] truncate text-sm text-muted-foreground sm:inline">
          {conversations.items.find((item) => item.id === conversationId)?.title ?? "工作台"}
        </span>
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
                  aria-label="清空当前视图"
                  onClick={handleNewConversation}
                  disabled={isStreaming}
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>清空当前视图，开始新会话</TooltipContent>
            </Tooltip>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden min-h-0 w-60 shrink-0 overflow-hidden border-r md:block lg:w-64">
          {sidebar}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ConversationView
            exchanges={exchanges}
            isStreaming={isStreaming}
            onPickExample={handlePickExample}
            onRetry={retry}
            onStop={stop}
            onSaveSnippet={handleSaveSnippet}
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
          <div className="min-h-0 flex-1">{sidebar}</div>
        </SheetContent>
      </Sheet>

      {snippetOpen ? (
        <SnippetDialog
          open={snippetOpen}
          mode="create"
          initial={snippetDraft}
          pending={snippetPending}
          onOpenChange={setSnippetOpen}
          onSubmit={handleSnippetSubmit}
        />
      ) : null}
    </div>
  );
}
