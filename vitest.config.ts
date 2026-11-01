import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * 两套测试环境，按扩展名分流：
 * - `*.test.ts`  → node：纯函数、SSE 解析、Zod 校验。跑得快，不需要 DOM。
 * - `*.test.tsx` → jsdom：组件渲染与交互。
 *
 * 分开是因为把纯函数塞进 jsdom 只会让每个用例慢几百毫秒，
 * 而 100 多个用例累积起来就是可感知的等待。
 *
 * 不装 @vitejs/plugin-react：测试不需要 Fast Refresh，esbuild 读 tsconfig 的
 * `jsx: react-jsx` 就能转换 TSX。少一个插件也就少一处 vite 版本冲突。
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      // 只统计需求文档 NFR-3 点名的"纯函数"模块。
      // 把 API 路由、React 组件也纳入会把阈值稀释成一个好看的假数字。
      include: [
        "src/lib/ai/context.ts",
        "src/lib/ai/errors.ts",
        "src/lib/ai/prompts.ts",
        "src/lib/ai/schemas.ts",
        "src/lib/ai-client/stream.ts",
        "src/lib/db/cursor.ts",
        "src/lib/db/schemas.ts",
        "src/lib/db/search.ts",
        "src/lib/markdown/extract-code.ts",
        "src/lib/constants.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 60,
      },
      reportOnFailure: true,
    },
  },
});
