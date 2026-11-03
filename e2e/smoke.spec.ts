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

test.describe("设置页", () => {
  test("展示四类设置与服务端变量说明，且不泄露真实值", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "默认值" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "模型调用" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "外观" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "服务端配置" })).toBeVisible();

    // 只应有变量名与示例占位，不能出现形如真实密钥的串
    await expect(page.getByRole("cell", { name: "AI_API_KEY", exact: true })).toBeVisible();
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(body).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    expect(body).not.toMatch(/sb_secret_[A-Za-z0-9]{10,}/);
  });

  test("修改默认语言后刷新仍在，并作用于工作台", async ({ page }) => {
    await page.goto("/settings");

    await page.getByRole("combobox", { name: "默认语言" }).click();
    await page.getByRole("option", { name: "Python" }).click();

    await page.reload();
    await expect(page.getByRole("combobox", { name: "默认语言" })).toContainText("Python");

    await page.goto("/workspace");
    await expect(page.locator("#composer-language")).toContainText("Python");
  });

  test("流式开关可关闭并保持", async ({ page }) => {
    await page.goto("/settings");

    const toggle = page.getByRole("switch", { name: "流式输出" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await page.reload();
    await expect(page.getByRole("switch", { name: "流式输出" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("恢复默认清空偏好", async ({ page }) => {
    await page.goto("/settings");

    await page.getByRole("combobox", { name: "默认语言" }).click();
    await page.getByRole("option", { name: "Go" }).click();
    await expect(page.getByRole("combobox", { name: "默认语言" })).toContainText("Go");

    await page.getByRole("button", { name: /恢复默认/ }).click();
    await expect(page.getByRole("combobox", { name: "默认语言" })).toContainText("TypeScript");
  });
});

test.describe("设置作用于真实请求", () => {
  test("温度与流式开关随请求体下发", async ({ page }) => {
    // 先写入偏好，再打开页面：模拟"上次已经设置好"
    await page.addInitScript(() => {
      localStorage.setItem(
        "codepilot.preferences.v1",
        JSON.stringify({
          defaultTaskType: "generate",
          defaultLanguage: "go",
          temperature: 0.7,
          streaming: false,
        }),
      );
    });

    // 拦下真实调用：这条用例只验证"请求长什么样"，不需要模型与数据库
    let captured: { options?: { temperature?: number; stream?: boolean }; language?: string } | null =
      null;
    await page.route("**/api/ai/generate", async (route) => {
      captured = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: [
          'data: {"type":"meta","requestId":"t","task":"generate","model":"stub"}',
          'data: {"type":"delta","text":"ok"}',
          'data: {"type":"done","usage":null,"model":"stub"}',
          "",
        ].join("\n\n"),
      });
    });

    await page.goto("/workspace");
    // 默认语言也该来自偏好
    await expect(page.locator("#composer-language")).toContainText("Go");

    await page.locator("#composer-prompt").fill("写个函数");
    await page.getByRole("button", { name: "生成代码", exact: true }).click();

    await expect.poll(() => captured?.options ?? null).not.toBeNull();
    expect(captured!.options).toEqual({ temperature: 0.7, stream: false });
    expect(captured!.language).toBe("go");
  });
});

test.describe("未匹配的路由", () => {
  test("返回 404 页面而不是白屏", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
  });
});
