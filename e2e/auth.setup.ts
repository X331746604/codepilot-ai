import { expect, test as setup } from "@playwright/test";

import { OTHER_USER, supabaseAdmin, TEST_USER } from "./helpers/user";

/**
 * 登录态准备：建账号 → 走真实登录页 → 把 cookie 存下来给其它用例复用。
 * 这样每个 spec 不必各自登录一遍，也不会因为登录逻辑变化而集体失败。
 */

async function prepare(user: { email: string; password: string }) {
  const admin = supabaseAdmin();
  const id = await admin.createUser(user.email, user.password);
  await admin.resetPassword(id, user.password);
}

setup("准备主账号并保存登录态", async ({ page }) => {
  await prepare(TEST_USER);

  await page.goto("/login");
  await page.getByLabel("邮箱").fill(TEST_USER.email);
  await page.getByLabel("密码").fill(TEST_USER.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await page.waitForURL("**/workspace", { timeout: 30_000 });
  await expect(page.locator("#composer-prompt")).toBeVisible({ timeout: 30_000 });

  await page.context().storageState({ path: "e2e/.auth/user.json" });
});

setup("准备第二个账号（用于越权验证）", async () => {
  await prepare(OTHER_USER);
});
