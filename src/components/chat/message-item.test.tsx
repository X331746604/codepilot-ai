import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Exchange } from "@/hooks/use-ai-task";

import { MessageItem } from "./message-item";

const base: Exchange = {
  id: "e1",
  task: "generate",
  language: "typescript",
  prompt: "写一个防抖 Hook",
  requestBody: null,
  output: "## 思路\n先看这个函数。",
  status: "done",
  usage: null,
  createdAt: Date.now(),
};

function setup(overrides: Partial<Exchange> = {}, canRetry = true) {
  const handlers = {
    onRetry: vi.fn(),
    onStop: vi.fn(),
    onSaveSnippet: vi.fn(),
  };
  render(<MessageItem exchange={{ ...base, ...overrides }} canRetry={canRetry} {...handlers} />);
  return handlers;
}

describe("MessageItem 的内容渲染", () => {
  it("用户提问原样显示（不显示拼装后的提示词模板）", () => {
    setup();
    expect(screen.getByText("写一个防抖 Hook")).toBeInTheDocument();
    expect(screen.queryByText(/编程语言：/)).not.toBeInTheDocument();
  });

  it("回答的 Markdown 标题被渲染成真正的标题元素", () => {
    setup();
    expect(screen.getByRole("heading", { name: "思路" })).toBeInTheDocument();
  });

  it("展示任务类型与语言", () => {
    setup();
    expect(screen.getByText("生成代码")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("元信息按 模型 · 耗时 · tokens 拼接", () => {
    setup({
      model: "qwen-plus",
      latencyMs: 9200,
      usage: { promptTokens: 300, completionTokens: 419, totalTokens: 719 },
    });
    expect(screen.getByText("qwen-plus · 9.2 s · 719 tokens")).toBeInTheDocument();
  });

  it("耗时不足一秒时用毫秒表示", () => {
    setup({ latencyMs: 640 });
    expect(screen.getByText("640 ms")).toBeInTheDocument();
  });
});

describe("MessageItem 的状态", () => {
  it("生成中显示进度提示与停止按钮", async () => {
    const user = userEvent.setup();
    const handlers = setup({ status: "streaming", output: "" });

    expect(screen.getByText("正在生成…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /停止/ }));
    expect(handlers.onStop).toHaveBeenCalled();
  });

  it("生成中不显示重试与保存入口", () => {
    setup({ status: "streaming", output: "" });
    expect(screen.queryByRole("button", { name: /保存片段/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /重新生成/ })).not.toBeInTheDocument();
  });

  it("被中止时标记「已停止」并保留已生成内容", () => {
    setup({ status: "canceled", output: "写了一半" });
    expect(screen.getByText("已停止")).toBeInTheDocument();
    expect(screen.getByText("写了一半")).toBeInTheDocument();
  });

  it("失败时展示错误码、服务端文案与排查提示", () => {
    setup({
      status: "error",
      output: "",
      error: { code: "RATE_LIMIT", message: "请求过于频繁，请稍后再试。", retryable: true },
    });

    expect(screen.getByText("生成失败（RATE_LIMIT）")).toBeInTheDocument();
    expect(screen.getByText("请求过于频繁，请稍后再试。")).toBeInTheDocument();
    expect(screen.getByText("触发了频率限制，等一会儿再试。")).toBeInTheDocument();
  });

  it("字段级校验错误逐条列出", () => {
    setup({
      status: "error",
      output: "",
      error: {
        code: "VALIDATION",
        message: "输入不合法",
        retryable: false,
        issues: [{ path: "prompt", message: "请先描述你的需求" }],
      },
    });

    expect(screen.getByText("prompt：请先描述你的需求")).toBeInTheDocument();
  });

  it("上下文被裁剪时给出徽标与保留条数", () => {
    setup({ context: { messages: 7, truncated: true } });
    expect(screen.getByText("上下文已裁剪 · 保留 7 条")).toBeInTheDocument();
  });

  it("上下文未裁剪时不显示徽标", () => {
    setup({ context: { messages: 4, truncated: false } });
    expect(screen.queryByText(/上下文已裁剪/)).not.toBeInTheDocument();
  });
});

describe("MessageItem 的操作", () => {
  it("点「保存片段」把整条交换交给上层", async () => {
    const user = userEvent.setup();
    const handlers = setup();

    await user.click(screen.getByRole("button", { name: /保存片段/ }));
    expect(handlers.onSaveSnippet).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
  });

  it("没有输出时不显示保存入口", () => {
    setup({ output: "" });
    expect(screen.queryByRole("button", { name: /保存片段/ })).not.toBeInTheDocument();
  });

  it("canRetry 为 false 时不显示重新生成（历史消息无法重放）", () => {
    setup({}, false);
    expect(screen.queryByRole("button", { name: /重新生成/ })).not.toBeInTheDocument();
  });

  it("点「重新生成」触发回调", async () => {
    const user = userEvent.setup();
    const handlers = setup();

    await user.click(screen.getByRole("button", { name: /重新生成/ }));
    expect(handlers.onRetry).toHaveBeenCalled();
  });
});
