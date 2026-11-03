import { expect, test } from "@playwright/test";

import { OTHER_USER, publicConfig, TEST_USER } from "./helpers/user";

/**
 * 认证与隔离。
 *
 * 这一组用例是需求文档 AC-17 / AC-18 的证据：
 * 未登录被拒、登录可用、退出即失效，以及"B 拿不到 A 的数据"——
 * 同时从**接口层**与**数据库 RLS**两条路径验证。
 */

test.describe("未登录", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("访问 /workspace 跳转登录页，并带上回跳地址", async ({ page }) => {
    await page.goto("/workspace");

    await expect(page).toHaveURL(/\/login\?next=%2Fworkspace/);
    await expect(page.getByRole("button", { name: "登录", exact: true })).toBeVisible();
  });

  test("访问 /settings 与 /snippets 同样被拦下", async ({ page }) => {
    await page.goto("/snippets");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("接口返回 401 而不是数据", async ({ request }) => {
    for (const path of ["/api/conversations", "/api/snippets", "/api/profile"]) {
      const response = await request.get(path);
      expect(response.status(), `${path} 应当 401`).toBe(401);
    }
  });

  test("健康检查不需要登录（部署探针要用）", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBe(true);
  });
});

test.describe("登录与退出", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("登录后进入工作台；退出后回登录页且会话失效", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("邮箱").fill(TEST_USER.email);
    await page.getByLabel("密码").fill(TEST_USER.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();

    await expect(page).toHaveURL(/\/workspace/, { timeout: 30_000 });
    await expect(page.locator("#composer-prompt")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: `账号：${TEST_USER.email}` }).click();
    await page.getByRole("menuitem", { name: /退出登录/ }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    // 退出后直接输入地址也进不去
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/login/);
  });

  test("密码错误时给出可读提示，且不会跳转", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("邮箱").fill(TEST_USER.email);
    await page.getByLabel("密码").fill("wrong-password-123");
    await page.getByRole("button", { name: "登录", exact: true }).click();

    await expect(page.getByRole("alert")).toContainText("邮箱或密码不正确");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("跨账号隔离", () => {
  test("B 既调不到 A 的接口，也读不到 RLS 保护的数据", async ({ request, browser }) => {
    test.setTimeout(180_000);

    // ---- A 建一条会话（当前 storageState 就是 A）----
    const title = `隔离验证-${Date.now()}`;
    const created = await request.post("/api/conversations", {
      data: { taskType: "generate", language: "typescript", title },
    });
    expect(created.status()).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string } };

    try {
      // ---- 接口层：B 登录后访问 A 的资源 ----
      const contextB = await browser.newContext({
        storageState: { cookies: [], origins: [] },
        baseURL: "http://127.0.0.1:3100",
      });
      const pageB = await contextB.newPage();

      await pageB.goto("/login");
      await pageB.getByLabel("邮箱").fill(OTHER_USER.email);
      await pageB.getByLabel("密码").fill(OTHER_USER.password);
      await pageB.getByRole("button", { name: "登录", exact: true }).click();
      await expect(pageB).toHaveURL(/\/workspace/, { timeout: 30_000 });

      const directRead = await pageB.request.get(`/api/conversations/${conversation.id}`);
      expect(directRead.status(), "越权读取应当 404").toBe(404);

      const rename = await pageB.request.patch(`/api/conversations/${conversation.id}`, {
        data: { title: "被篡改" },
      });
      expect(rename.status(), "越权重命名应当 404").toBe(404);

      const remove = await pageB.request.delete(`/api/conversations/${conversation.id}`);
      expect(remove.status(), "越权删除应当 404").toBe(404);

      const listB = await pageB.request.get("/api/conversations?limit=50");
      const body = (await listB.json()) as { conversations: Array<{ id: string; title: string }> };
      expect(body.conversations.some((item) => item.id === conversation.id)).toBe(false);
      expect(body.conversations.some((item) => item.title === title)).toBe(false);

      await contextB.close();

      // ---- RLS：绕过应用，直接用 B 的 access token 查 PostgREST ----
      const config = publicConfig();
      const tokenResponse = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: config.key, "Content-Type": "application/json" },
        body: JSON.stringify({ email: OTHER_USER.email, password: OTHER_USER.password }),
      });
      expect(tokenResponse.ok).toBe(true);
      const { access_token } = (await tokenResponse.json()) as { access_token: string };

      const rlsResponse = await fetch(
        `${config.url}/rest/v1/conversations?id=eq.${conversation.id}&select=id,title`,
        { headers: { apikey: config.key, Authorization: `Bearer ${access_token}` } },
      );
      expect(rlsResponse.ok).toBe(true);
      expect(await rlsResponse.json(), "RLS 应当把别人的行挡在外面").toEqual([]);

      // 同一把 token 读自己的数据是通的，说明不是密钥整体失效
      const ownResponse = await fetch(
        `${config.url}/rest/v1/conversations?select=id&limit=1`,
        { headers: { apikey: config.key, Authorization: `Bearer ${access_token}` } },
      );
      expect(ownResponse.ok).toBe(true);
    } finally {
      // A 清理自己造的数据
      await request.delete(`/api/conversations/${conversation.id}`);
    }
  });
});
