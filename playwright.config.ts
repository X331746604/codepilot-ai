import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // 主链路会写真实数据库，不能并行
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // 用系统自带的 Edge：本机下载 Chromium 走国际 CDN 很慢，而且没必要
    channel: "msedge",
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Supabase 走代理；这些变量会传给 dev server 子进程。
    // 必须展开 process.env：Playwright 传了 env 就不再继承父进程环境。
    env: {
      ...(process.env as Record<string, string>),
      NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY ?? "1",
      NO_PROXY: process.env.NO_PROXY ?? "localhost,127.0.0.1",
    },
  },
});
