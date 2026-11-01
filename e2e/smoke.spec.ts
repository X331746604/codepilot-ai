import { expect, test } from "@playwright/test";

/**
 * 冒烟用例：只验证"页面能打开、骨架在、关键控件可交互"。
 * 不依赖数据库与模型服务，因此在任何环境下都应当通过——
 * 它同时也是"服务起没起来"的最快检查。
 */

test.describe("首页", () => {
  test("展示定位、四类事实与进入工作台的入口", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/CodePilot AI/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("从一句话到一段代码");
    await expect(page.getByText("生成 / 解释 / 调试 / 重构")).toBeVisible();
    await expect(page.getByText("不执行，只做分析")).toBeVisible();
    await expect(page.getByText("仅存在于服务端")).toBeVisible();
  });

  test("点「打开工作台」进入 /workspace", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /打开工作台/ }).click();
    await expect(page).toHaveURL(/\/workspace$/);
  });
});

test.describe("工作台骨架", () => {
  test("四类任务、输入框、语言选择与提交按钮都在", async ({ page }) => {
    await page.goto("/workspace");

    await expect(page.locator("#composer-prompt")).toBeVisible();
    await expect(page.locator("#composer-language")).toContainText("TypeScript");

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(tabs.filter({ hasText: "生成代码" })).toBeVisible();
    await expect(tabs.filter({ hasText: "解释代码" })).toBeVisible();
    await expect(tabs.filter({ hasText: "分析错误" })).toBeVisible();
    await expect(tabs.filter({ hasText: "重构代码" })).toBeVisible();
  });

  test("输入内容后提交按钮才可用，字数统计同步", async ({ page }) => {
    await page.goto("/workspace");

    // exact 必须加：空态里的示例卡片也带「生成代码」前缀，模糊匹配会命中两个
    const submit = page.getByRole("button", { name: "生成代码", exact: true });
    await expect(submit).toBeDisabled();

    await page.locator("#composer-prompt").fill("写一个防抖函数");
    await expect(page.getByText("7 / 8000")).toBeVisible();
    await expect(submit).toBeEnabled();
  });

  test("切换到「分析错误」后多出必填的报错框，缺它不能提交", async ({ page }) => {
    await page.goto("/workspace");

    await page.getByRole("tab", { name: "分析错误" }).click();
    await expect(page.locator("#composer-error")).toBeVisible();

    await page.locator("#composer-prompt").fill("const a = b.c()");
    await expect(page.getByText("调试任务需要提供报错信息")).toBeVisible();
    await expect(page.getByRole("button", { name: "分析错误", exact: true })).toBeDisabled();
  });

  test("空态里的示例可以点进输入框，但不会自动发送", async ({ page }) => {
    await page.goto("/workspace");

    await page.getByRole("button", { name: /写一个防抖 Hook/ }).first().click();
    await expect(page.locator("#composer-prompt")).toHaveValue(/useDebounce/);
    // 只填入、不发送：仍然停留在空态，没有出现对话
    await expect(page.getByRole("heading", { name: "思路" })).toHaveCount(0);
  });
});

test.describe("代码片段页", () => {
  test("外壳与搜索、语言筛选、新建入口都在", async ({ page }) => {
    await page.goto("/snippets");

    await expect(page.getByRole("textbox", { name: "搜索片段" })).toBeVisible();
    // 语言筛选是 Radix Select，无障碍角色是 combobox 而不是 button
    await expect(page.getByRole("combobox", { name: "按语言筛选" })).toBeVisible();
    await expect(page.getByRole("button", { name: /新建片段/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /返回工作台/ })).toBeVisible();
  });
});

test.describe("未匹配的路由", () => {
  test("返回 404 页面而不是白屏", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
  });
});
