import { Bug, Sparkles, Wrench, Search } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskType } from "@/lib/constants";

type Capability = {
  task: TaskType;
  icon: typeof Sparkles;
  title: string;
  summary: string;
  outputs: string[];
};

const CAPABILITIES: Capability[] = [
  {
    task: "generate",
    icon: Sparkles,
    title: "生成代码",
    summary: "用自然语言描述需求，选定语言与约束，直接拿到可读的实现。",
    outputs: ["实现思路说明", "带语言标识的完整代码", "依赖与运行说明"],
  },
  {
    task: "explain",
    icon: Search,
    title: "解释代码",
    summary: "陌生实现不必逐行猜。粘贴进来，按结构拆开讲清楚。",
    outputs: ["用途与适用场景", "执行流程与关键函数", "输入输出数据流"],
  },
  {
    task: "debug",
    icon: Bug,
    title: "分析错误",
    summary: "同时给出代码、报错与运行环境，让定位有依据而不是靠猜。",
    outputs: ["原因按可能性排序", "修改前后 diff", "可自行执行的验证步骤"],
  },
  {
    task: "refactor",
    icon: Wrench,
    title: "重构代码",
    summary: "在行为不变的前提下，改善命名、拆分函数、消除重复。",
    outputs: ["重构前后对比", "逐条改动原因", "兼容性影响提示"],
  },
];

export function FeatureGrid() {
  return (
    <section id="capabilities" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">四类任务，一套结构</h2>
          <p className="mt-3 text-muted-foreground">
            每类任务的输出都是固定分区的，而不是一段自由发挥的文本。这样你才知道该看哪一块，
            也才知道结果里缺了什么。
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((capability) => {
            const Icon = capability.icon;
            return (
              <Card key={capability.task} className="transition-colors hover:border-foreground/20">
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-md border bg-muted/50">
                      <Icon className="size-4" />
                    </span>
                    <CardTitle>{capability.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">{capability.summary}</p>
                  <ul className="space-y-1.5">
                    {capability.outputs.map((output) => (
                      <li key={output} className="flex items-start gap-2 text-sm">
                        <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/40" />
                        {output}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
