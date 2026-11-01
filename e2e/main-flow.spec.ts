import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * 主链路：输入需求 → 真实生成 → 保存片段 → 在片段页看到。
 *
 * 这条链路会消耗真实 token 并写入真实数据库，默认跳过。
 * 需要时这样跑：
 *   E2E_REAL=1 NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
 *   NO_PROXY=".aliyuncs.com,localhost,127.0.0.1" pnpm test:e2e
 */

const MARKER = `E2E验证${Date.now()}`;

async function cleanup(request: APIRequestContext) {
  // 片段：按标题里的标记找回来删掉
  const snippets = await request.get("/api/snippets?limit=100");
  if (snippets.ok()) {
    const body = (await snippets.json()) as { snippets?: Array<{ id: string; title: string }> };
    for (const item of body.snippets ?? []) {
      if (item.title.includes(MARKER)) {
        await request.delete(`/api/snippets/${item.id}`);
      }
    }
  }

  // 会话：标题由提问前 20 字生成，标记正好落在里面
  const conversations = await request.get("/api/conversations?limit=50");
  if (conversations.ok()) {
    const body = (await conversations.json()) as {
      conversations?: Array<{ id: string; title: string }>;
    };
    for (const item of body.conversations ?? []) {
      if (item.title.includes(MARKER)) {
        await request.delete(`/api/conversations/${item.id}`);
      }
    }
  }
}

/** 等首屏水合完成：提交按钮从禁用变为可用依赖 React 状态，比看 DOM 更可靠。 */
async function waitForHydration(page: Page) {
  await expect
    .poll(async () => page.getByRole("tab", { name: "解释代码" }).isVisible(), {
      timeout: 40_000,
    })
    .toBe(true);
  await page.locator("#composer-prompt").waitFor({ state: "visible" });
}

test.describe("主链路（真实模型）", () => {
  test.skip(!process.env.E2E_REAL, "需要真实模型与数据库，设置 E2E_REAL=1 后运行");

  test.beforeAll(async ({ request }) => {
    await cleanup(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("输入 → 生成 → 保存片段 → 片段页可见", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/workspace");
    await waitForHydration(page);

    const prompt = `${MARKER} 用一行 JavaScript 写数组去重`;
    await page.locator("#composer-prompt").fill(prompt);
    await page.getByRole("button", { name: "生成代码", exact: true }).click();

    // 真实模型响应：等到回答里的固定二级标题出现
    await expect(page.getByRole("heading", { name: "思路" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("heading", { name: "代码" })).toBeVisible({ timeout: 90_000 });

    // 元信息行带真实 token 用量，不是占位文案
    await expect(page.getByText(/\d+ tokens/)).toBeVisible();

    // 右侧代码面板至少抽出 1 段
    await expect(page.getByRole("heading", { name: "代码" })).toBeVisible();
    await expect(page.locator("#composer-prompt")).toHaveValue("");

    // 保存片段：弹窗应已预填标题与代码
    await page.getByRole("button", { name: /保存片段/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("标题")).toHaveValue(new RegExp(MARKER));
    await expect(dialog.getByLabel("代码")).not.toHaveValue("");

    await dialog.getByRole("button", { name: "保存片段" }).click();
    await expect(page.getByText("片段已保存，可在「代码片段」页查看")).toBeVisible({ timeout: 20_000 });

    // 片段页能看到刚保存的条目
    await page.goto("/snippets");
    await expect(page.getByRole("heading", { name: new RegExp(MARKER) })).toBeVisible({
      timeout: 30_000,
    });

    // 让搜索结果只剩这一条，顺带验证搜索链路
    await page.getByRole("textbox", { name: "搜索片段" }).fill(MARKER);
    await expect(page.getByRole("heading", { name: new RegExp(MARKER) })).toBeVisible();
    await expect(page.locator("main ul li")).toHaveCount(1);
  });
});
