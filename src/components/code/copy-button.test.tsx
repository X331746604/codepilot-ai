import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./copy-button";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  // 每个用例的剪贴板桩互不影响
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("CopyButton", () => {
  it("点击后把文本写进剪贴板并给出反馈", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<CopyButton text="const a = 1" />);
    await user.click(screen.getByRole("button", { name: "复制内容" }));

    expect(writeText).toHaveBeenCalledWith("const a = 1");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument();
    });
  });

  it("剪贴板失败时不冒充成功", async () => {
    const user = userEvent.setup();
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));

    render(<CopyButton text="x" />);
    await user.click(screen.getByRole("button", { name: "复制内容" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "复制内容" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "已复制" })).not.toBeInTheDocument();
  });

  it("空文本不触发复制", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<CopyButton text="" />);
    await user.click(screen.getByRole("button", { name: "复制内容" }));

    expect(writeText).not.toHaveBeenCalled();
  });
});
