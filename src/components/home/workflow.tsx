import { ClipboardList, MessageSquareCode, Sparkles } from "lucide-react";

const STEPS = [
  {
    icon: ClipboardList,
    title: "选任务与语言",
    description: "四类任务对应四种输入表单，需要报错信息的时候会明确要求你填。",
  },
  {
    icon: MessageSquareCode,
    title: "描述需求或粘贴代码",
    description: "生成写需求，解释与重构贴代码，调试额外给报错与运行环境。",
  },
  {
    icon: Sparkles,
    title: "拿到结构化结果",
    description: "结果按分区呈现，可复制、可重新生成、可在同一会话里继续追问。",
  },
];

export function Workflow() {
  return (
    <section className="border-b bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">怎么用</h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="relative rounded-lg border bg-background p-5">
                <span className="absolute top-5 right-5 font-mono text-xs text-muted-foreground">
                  0{index + 1}
                </span>
                <Icon className="size-5" />
                <h3 className="mt-4 text-sm font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
