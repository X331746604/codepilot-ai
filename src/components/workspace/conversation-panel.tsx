import { Sparkles } from "lucide-react";

import { TASK_TYPES, type TaskType } from "@/lib/constants";

const EXAMPLES: Array<{ mode: TaskType; label: string; prompt: string }> = [
  {
    mode: "generate",
    label: "写一个防抖 Hook",
    prompt:
      "用 TypeScript 写一个 useDebounce Hook：支持泛型、可配置延迟，并在组件卸载时清理定时器。要求零运行时依赖，带注释。",
  },
  {
    mode: "explain",
    label: "这段 useEffect 为什么重复请求",
    prompt:
      "请解释下面这段 React 组件：为什么它会在每次渲染后重复发起请求，以及依赖数组在这里起了什么作用。\n\n```tsx\nuseEffect(() => {\n  fetch('/api/user').then((res) => res.json()).then(setUser);\n});\n```",
  },
  {
    mode: "debug",
    label: "Cannot read properties of undefined",
    prompt:
      "运行时报错：TypeError: Cannot read properties of undefined (reading 'map')。\n\n```ts\nconst list = data.items.map((item) => item.name);\n```\n\n运行环境：Node.js 20 + React 19，data 来自一次接口请求。",
  },
  {
    mode: "refactor",
    label: "拆开这个 200 行函数",
    prompt:
      "下面这个函数同时做了参数校验、数据转换和写库三件事。请在不改变外部行为的前提下拆分职责、改善命名，并说明兼容性影响。",
  },
];

export function ConversationEmptyState({
  onPickExample,
}: {
  onPickExample: (mode: TaskType, prompt: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-10 text-center sm:px-6 sm:py-16">
        <span className="grid size-10 place-items-center rounded-lg border bg-muted/40">
          <Sparkles className="size-5" />
        </span>

        <h1 className="mt-4 text-lg font-semibold tracking-tight sm:text-xl">今天想处理哪段代码？</h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          先选任务类型再描述需求，或者直接点一个例子填进输入框。
        </p>

        <div className="mt-8 grid w-full gap-2 text-left sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => onPickExample(example.mode, example.prompt)}
              className="rounded-lg border bg-card p-3 text-left transition-colors outline-none hover:border-foreground/25 hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-xs text-muted-foreground">
                {TASK_TYPES.find((task) => task.value === example.mode)?.label}
              </span>
              <span className="mt-1 block text-sm font-medium">{example.label}</span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          示例只填入输入框，不会自动发送——发送功能需要先接入模型服务。
        </p>
      </div>
    </div>
  );
}
