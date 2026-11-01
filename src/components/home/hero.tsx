import Link from "next/link";
import { ArrowRight, Layers, ShieldCheck, SquareCode, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** 只陈述当前成立的事实，不写无法验证的用户量或效果指标。 */
const FACTS = [
  { icon: Layers, label: "任务类型", value: "生成 / 解释 / 调试 / 重构" },
  { icon: SquareCode, label: "语言选项", value: "8 种常用语言" },
  { icon: Terminal, label: "用户代码执行", value: "不执行，只做分析" },
  { icon: ShieldCheck, label: "API 密钥", value: "仅存在于服务端" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--muted),transparent)]"
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Badge variant="outline" className="font-normal">
          MVP 开发中 · 核心链路已接通，账号体系待接入
        </Badge>

        <h1 className="mt-6 max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          {"从一句话到一段代码，"}
          {/* 中文没有词间空格，交给浏览器自动换行会把"代码"拆开，因此在语义断点强制换行 */}
          <br className="hidden sm:inline" />
          {"中间不用换工具"}
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          CodePilot AI 是一个 AI 编程工作台。生成、解释、调试、重构四条路径共用同一套输入与结果结构，
          历史会话与代码片段留在同一个地方——不用在聊天窗口、编辑器和笔记之间来回搬运上下文。
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="h-10 px-5">
            <Link href="/workspace">
              打开工作台
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-10 px-5">
            <Link href="#capabilities">看它能做什么</Link>
          </Button>
        </div>

        <dl className="mt-14 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((fact) => {
            const Icon = fact.icon;
            return (
              <div key={fact.label} className="flex items-start gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
