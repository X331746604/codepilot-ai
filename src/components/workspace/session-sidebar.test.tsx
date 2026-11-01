import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ConversationSummary } from "@/lib/db/types";

import { SessionSidebar } from "./session-sidebar";

// next/link 在 App Router 之外渲染会拿不到 router 上下文，用 <a> 顶替
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const conversation = (id: string, title: string): ConversationSummary => ({
  id,
  title,
  task_type: "generate",
  language: "typescript",
  last_message_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
});

function setup(overrides: Partial<React.ComponentProps<typeof SessionSidebar>> = {}) {
  const props: React.ComponentProps<typeof SessionSidebar> = {
    items: [],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasMore: false,
    query: "",
    range: "all",
    activeId: null,
    onQueryChange: vi.fn(),
    onRangeChange: vi.fn(),
    onLoadMore: vi.fn(),
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(<SessionSidebar {...props} />);
  return props;
}

describe("SessionSidebar 的状态分支", () => {
  it("加载中显示占位而不是空态", () => {
    setup({ isLoading: true });
    expect(screen.getByText("加载中")).toBeInTheDocument();
    expect(screen.queryByText("还没有会话")).not.toBeInTheDocument();
  });

  it("接口出错时显示错误文案", () => {
    setup({ error: "加载会话列表失败（HTTP 500）" });
    expect(screen.getByText("加载会话列表失败（HTTP 500）")).toBeInTheDocument();
  });

  it("没有数据且没有筛选时引导发送第一条消息", () => {
    setup();
    expect(screen.getByText("还没有会话")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "清除筛选" })).not.toBeInTheDocument();
  });

  it("筛选后无结果时提示换关键词，并给出清除入口", () => {
    setup({ query: "不存在的词" });
    expect(screen.getByText("没有匹配的会话")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除筛选" })).toBeInTheDocument();
  });

  it("时间范围也会被算作筛选条件", () => {
    setup({ range: "7d" });
    expect(screen.getByText("没有匹配的会话")).toBeInTheDocument();
  });
});

describe("SessionSidebar 的交互", () => {
  it("渲染会话标题与相对时间", () => {
    setup({ items: [conversation("a", "写一个防抖 Hook")] });
    expect(screen.getByText("写一个防抖 Hook")).toBeInTheDocument();
    expect(screen.getByText("刚刚")).toBeInTheDocument();
  });

  it("点击会话把 id 回传给上层", async () => {
    const user = userEvent.setup();
    const props = setup({ items: [conversation("abc", "会话一")] });

    await user.click(screen.getByText("会话一"));
    expect(props.onSelect).toHaveBeenCalledWith("abc");
  });

  it("输入搜索词时把值交给上层（受控组件）", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.type(screen.getByLabelText("搜索会话标题"), "Hook");
    expect(props.onQueryChange).toHaveBeenCalled();
  });

  it("点时间范围按钮回传对应取值", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: "近 7 天" }));
    expect(props.onRangeChange).toHaveBeenCalledWith("7d");
  });

  it("当前选中的范围按钮有 aria-pressed 标记", () => {
    setup({ range: "30d" });
    expect(screen.getByRole("button", { name: "近 30 天" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "false");
  });

  it("点「新建会话」触发回调", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: /新建会话/ }));
    expect(props.onNew).toHaveBeenCalled();
  });
});

describe("SessionSidebar 的分页提示", () => {
  it("还有下一页时提示可以继续滚动", () => {
    setup({ items: [conversation("a", "会话一")], hasMore: true });
    expect(screen.getByText("向下滚动加载更多")).toBeInTheDocument();
  });

  it("加载下一页时显示加载态", () => {
    setup({ items: [conversation("a", "会话一")], hasMore: true, isLoadingMore: true });
    expect(screen.getByText("加载更多")).toBeInTheDocument();
  });

  it("到底且条目较多时提示已到末尾", () => {
    const items = Array.from({ length: 8 }, (_, index) => conversation(`id-${index}`, `会话 ${index}`));
    setup({ items, hasMore: false });
    expect(screen.getByText("已到末尾")).toBeInTheDocument();
  });

  it("条目很少时不显示「已到末尾」，避免小题大做", () => {
    const items = Array.from({ length: 3 }, (_, index) => conversation(`id-${index}`, `会话 ${index}`));
    setup({ items, hasMore: false });
    expect(screen.queryByText("已到末尾")).not.toBeInTheDocument();
  });
});

describe("SessionSidebar 的删除确认", () => {
  it("删除必须先确认，不会直接调用 onDelete", async () => {
    const user = userEvent.setup();
    const props = setup({ items: [conversation("abc", "会话一")] });

    await user.click(screen.getByRole("button", { name: "会话操作" }));
    await user.click(await screen.findByRole("menuitem", { name: /删除/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("删除这个会话？")).toBeInTheDocument();
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
