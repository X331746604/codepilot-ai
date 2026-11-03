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
    // trace 里每个网络分片都会落成独立文件（单个用例能有上百个），
    // 而本机的删除保护会拦下超过 50 个文件的批量删除，导致下一次跑测试时
    // Playwright 清理输出目录直接失败。失败时仍有截图 + 页面快照 + 堆栈，够定位问题。
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    // 先跑登录态准备：建账号 → 真实登录 → 存 cookie
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "e2e",
      testMatch: /.*\.spec\.ts/,
      use: { storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Supabase 走代理；这些变量会传给 dev server 子进程。
    // 必须展开 process.env：Playwright 传了 env 就不再继承父进程环境。
    env: {
      ...(process.env as Record<string, string>),
      // 与生产构建分开，否则 next dev 会试图清空 .next，被本机的删除保护拦下
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-e2e",
      NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY ?? "1",
      NO_PROXY: process.env.NO_PROXY ?? "localhost,127.0.0.1",
    },
  },
});
