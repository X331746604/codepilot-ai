# 测试说明

## 1. 现状

| 层 | 工具 | 文件 | 用例数 |
|---|---|---|---|
| 纯函数与编排层（node） | Vitest | 14 个 `*.test.ts` | 179 |
| 组件测试（jsdom） | Vitest + Testing Library | 4 个 `*.test.tsx` | 41 |
| 端到端（真实浏览器） | Playwright（系统 Edge） | 3 个 spec + 1 个 setup | 26（含 2 条登录态准备、2 条安全响应头、1 条 CSP hydration、1 条可选主链路） |

合计 **220 个用例**，`pnpm test` 约 16 秒跑完；e2e 冒烟约 3 分钟，主链路约 15 秒。

生产模式（`E2E_PROD=1`）用 `next start` 跑同一批冒烟用例。dev 会放行 `unsafe-eval`，而线上不会——CSP 与 hydration 必须在生产模式下各验一次。

端到端用例分三组：`smoke.spec.ts`（页面骨架）、`auth.spec.ts`（未登录拦截 / 登录退出 / 跨账号隔离）、
`main-flow.spec.ts`（真实模型主链路，默认跳过）。登录态由 `auth.setup.ts` 准备：
用 Admin API 建「已确认」的账号，再走一遍真实的登录表单，把 cookie 存成 `e2e/.auth/user.json` 复用。

## 2. 命令

```bash
pnpm test            # 跑全部单测 + 组件测试
pnpm test:watch      # 监听模式
pnpm test:coverage   # 带覆盖率，低于阈值会失败
pnpm test:e2e        # 冒烟 e2e（不需要数据库与模型）
pnpm verify:migrations  # 用 PGlite 跑全部迁移并验证 RLS（无需网络）
pnpm verify          # typecheck + lint + test，提交前跑这个
```

`verify:migrations` 在本地用 WASM 版 Postgres 依次执行四份迁移，先搭一个最小的
`auth.users` / `auth.uid()` 等价物，再模拟两个账号验证：读不到、改不动、删不掉、
插不进对方的会话，以及删账号时数据级联。它抓的是「SQL 写了不存在的列」这类
只有贴到 SQL Editor 才会暴露的错误（0004 第一版就踩过），但不能替代
`scripts/verify-supabase.mjs` 对真实 Supabase 的验证。

真实主链路（会调用模型、写数据库，默认跳过）：

```bash
E2E_REAL=1 \
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
NO_PROXY=".aliyuncs.com,localhost,127.0.0.1" \
pnpm test:e2e --grep "主链路"
```

## 3. 为什么分两套环境

`src/**/*.test.ts` 跑在 node，`src/**/*.test.tsx` 跑在 jsdom。

纯函数（上下文裁剪、SSE 解析、Zod 校验）不需要 DOM。把它们塞进 jsdom 每个用例要多花几百毫秒，127 个用例累积起来就是十几秒的纯等待。按扩展名分流后，node 那套总共只跑 100 毫秒出头。

## 4. 覆盖率：只统计"值得统计的"

`vitest.config.ts` 里的 `coverage.include` 只列了 10 个纯函数模块（需求文档 NFR-3 点名的 Prompt 组装、上下文裁剪、错误映射、代码块解析，加上游标、搜索清洗与请求校验）。

**不把 API 路由和 React 组件算进去**，是因为它们的覆盖需要真实数据库或大量交互脚手架，混进来只会把阈值稀释成一个好看但没意义的数字。

当前实测：

| 模块 | 行覆盖 |
|---|---|
| `lib/constants.ts` | 100% |
| `lib/ai/{context,errors,prompts,schemas}.ts` | 100% |
| `lib/ai/provider.ts` | 91.7% |
| `lib/db/{cursor,search,schemas}.ts` | 90.9% / 100% / 100% |
| `lib/markdown/extract-code.ts` | 100% |
| `lib/ai-client/stream.ts` | 95.5% |
| `lib/preferences{,-store}.ts` | 97.1% / 100% |
| **合计** | **97.1%** |

阈值设为行/函数/语句 70%、分支 60%——比实测低一截，是因为它是"不许退步"的红线，不是目标值。故意写低一点，避免新增一行防御性代码就卡住流水线。

## 5. 三层各测什么

**单测**盯的是"改这里会悄悄改坏别处"的地方：

- `trimContext`：三条裁剪规则的边界（恰好等于上限、并列、超预算后一路丢到空）
- `streamAiTask`：一帧被拆成两个分片、CRLF、坏 JSON、流中途 `error` 事件、读流时被中止
- `buildMessages`：system 与 user 不串（用户输入里的"忽略上面的规则"不会进系统提示）
- `cursor`：伪造游标一律拒绝，不会带进 SQL
- `ai/schemas`：四类任务各自的必填与上限，以及 `options.temperature` 的越界拒绝
- `ai/provider`：流式解析、非流式一次性返回、`stream_options` 只在流式时出现、401 不重试 / 5xx 重试一次
- `ai/handler`：请求体校验、配置缺失、以及"校验先于限流"（20 次非法请求仍返回 400 而不是 429）
- `preferences` / `preferences-store`：字段级容错、温度夹取、跨标签页同步、坏数据回退默认值
- `ai/handler` 的鉴权分支：未登录时**连请求体都不解析**就返回 401

**组件测试**只覆盖"状态分支多、错了用户会困惑"的三个组件：会话侧栏（加载/错误/无数据/无匹配/分页提示）、消息气泡（生成中/已停止/失败/裁剪徽标）、复制按钮（成功与失败不能混为一谈）。

**e2e** 分两档：

- `smoke.spec.ts`：页面能打开、骨架在、输入与校验生效、404 不白屏。不碰数据库与模型，任何环境都应通过。
- `main-flow.spec.ts`：输入 → 真实生成 → 保存片段 → 片段页可见 → 搜索命中。会花真实 token，因此用 `E2E_REAL=1` 显式开启，并在前后各清理一次测试数据。

## 6. 明确没有覆盖的

1. **API 路由的完整链路**：`/api/ai/*` 只测到"鉴权 + 校验 + 配置 + 落库之前"的编排层，真正读写数据库的那段依赖 Supabase；`/api/conversations`、`/api/snippets`、`/api/profile` 则完全没有单测。本地测这些要么起一个假服务、要么连真库，目前靠 e2e 与每轮任务的 `curl` 实测兜底。
2. **数据库约束与 RLS**：`pnpm verify:migrations` 在 PGlite 里验证策略行为，`scripts/verify-supabase.mjs` 验证真实 Supabase 的读写与级联；两者都不在 `pnpm test` 里，因为前者需要 WASM 启动、后者需要网络与凭据。
3. **主题切换、移动端抽屉、下拉菜单**：Radix 的 Portal 与焦点管理在 jsdom 里行为与真实浏览器差异较大，测出来的通过率不代表真实可用。
4. **视觉回归**：没有截图比对。界面问题仍靠人工看截图。
5. **并发**：`seq` 分配的竞态、翻页期间插入新记录，都没有做并发测试。

## 7. 踩过的坑

1. **pnpm 12 默认不放行 `postinstall`**，esbuild 的二进制没链接上，vitest 直接起不来。解决办法是在 `pnpm-workspace.yaml` 的 `allowBuilds` 里显式写了 `esbuild: true`。
2. **`@vitejs/plugin-react@6` 依赖 vite 8，而 vitest 3 内置 vite 7**，两套 `Plugin` 类型不兼容，`tsc` 报一长串 `hotUpdate` 不匹配。最后干脆不装这个插件——测试不需要 Fast Refresh，esbuild 读 `tsconfig` 的 `jsx: react-jsx` 就能转 TSX。
3. **jsdom 没有 `IntersectionObserver` / `ResizeObserver`**，侧栏的触底加载一挂载就抛 `ReferenceError`。在 `vitest.setup.ts` 里给了空实现。
4. **`next/link` 在 App Router 之外渲染会拿不到 router 上下文**，组件测试里用 `vi.mock` 换成普通 `<a>`。
5. **Playwright 的 strict mode 会拦住"同名元素"**：空态示例卡片的无障碍名字是「生成代码 写一个防抖 Hook」，与提交按钮「生成代码」同时命中。加 `exact: true` 才能唯一匹配。
6. **Radix Select 的无障碍角色是 `combobox` 而不是 `button`**，按 button 找会一直等不到。
7. **断言写错会被当成产品缺陷**：第一次跑 e2e 时 4 条失败全是选择器/文案写错，不是功能坏了。这也是"人工验证容易误判"的实证——同样的场景固化成用例后，错一次就永久修掉了。
8. **`signOut()` 默认是全局吊销**：supabase-js 的 `signOut()` 不带参数时 scope=global，会在服务端吊销该账号的**全部** refresh token。退出用例如果拿共享账号来测，setup 存的 storageState 会在这一条之后集体失效——后续页面全被判定为未登录，表现为整片重定向与 `Auth session missing`。现在退出用例用一次性账号（`e2e-logout@codepilot.local`），与共享账号隔离。
9. **`getByRole("alert")` 会命中 Next 的路由播报器**：`__next-route-announcer__` 也是 `role=alert`，登录失败提示的断言会触发 strict mode 报错。改成按文案定位。
10. **dev 与 build 共用一个 `.next` 会互相清理**：`next dev` 启动时发现目录里是生产构建产物，会整目录删除；本机的删除保护在 50 个文件处拦截，表现为 webServer 直接起不来。现在 e2e 通过 `NEXT_DIST_DIR=.next-e2e` 使用独立目录（`playwright.config.ts` 的 webServer env），生产构建仍用 `.next`。
