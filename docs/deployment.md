# 部署

目标：Vercel Hobby + Supabase 免费项目 + 通义千问（DashScope）。

**一个关键结论**：生产环境**不需要** `SUPABASE_SECRET_KEY`。任务 13 之后，所有请求路径用的是「publishable key + 用户 token」，secret key 只在脚本里用（建表、建测试账号）。少配一把能绕过 RLS 的钥匙，是这次改造顺带拿到的收益。

## 1. 前置条件

| 项 | 要求 |
|---|---|
| 代码 | 已在本地通过 `pnpm build`、`pnpm test`、`pnpm test:e2e` |
| Supabase | 四份迁移已按顺序执行完（`0001`–`0004`） |
| Vercel | 账号（GitHub 登录即可），Hobby 计划 |
| 模型 | 一个可用的 DashScope Key，余额足够演示 |

## 2. 生产环境变量

在 Vercel Project → Settings → Environment Variables 中配置。**只有前五项是必需的**。

| 变量 | 必需 | 说明 |
|---|---|---|
| `AI_API_KEY` | ✅ | DashScope Key，仅服务端读取 |
| `AI_BASE_URL` | ✅ | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `AI_MODEL` | ✅ | `qwen-plus` |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | `sb_publishable_...`，公开无风险 |
| `AI_TIMEOUT_MS` | 可选 | 默认 60000 |
| `AI_RATE_LIMIT_PER_MINUTE` | 可选 | 默认 10 |
| `AI_RATE_LIMIT_PER_HOUR` | 可选 | 默认 60 |
| `SUPABASE_SECRET_KEY` | **不需要** | 只在本地脚本中使用；配到生产只会扩大暴露面 |

两个 `NEXT_PUBLIC_*` 在**构建期**被内联进客户端产物，改完必须重新部署才生效。

## 3. 方式 A：Vercel CLI（推荐）

需要你先完成一次登录（交互式，无法代跑）：

```bash
pnpm dlx vercel login
```

登录后，下面的命令可以代跑：

```bash
pnpm dlx vercel link --yes                 # 关联/创建项目
pnpm dlx vercel env add AI_API_KEY production
pnpm dlx vercel env add AI_BASE_URL production
pnpm dlx vercel env add AI_MODEL production
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_URL production
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
pnpm dlx vercel --prod
```

`vercel env add` 会从 stdin 读取值，非交互写法：

```bash
printf '%s' "$VALUE" | pnpm dlx vercel env add AI_API_KEY production
```

或者用一次性 Token（Vercel → Account Settings → Tokens），把它放进 `VERCEL_TOKEN` 环境变量，其余命令不变。

## 4. 方式 B：GitHub + Dashboard

1. 建一个空仓库，`git remote add origin …` 并 push。
2. Vercel → **Add New → Project** → 选中该仓库，Framework 自动识别为 Next.js。
3. 按第 2 节填环境变量 → **Deploy**。
4. 之后每次 push 到 `main` 自动部署。

> 当前仓库还没有 Git 远端（`git remote -v` 为空），走这条路需要先建仓库并推送。

## 5. Supabase 后台需要配套改两处

1. **Authentication → URL Configuration**
   - `Site URL` 填 Vercel 生产域名，例如 `https://codepilot-xxx.vercel.app`
   - `Redirect URLs` 追加 `https://codepilot-xxx.vercel.app/**`
   不改的话，注册确认邮件里的链接会指向 `localhost:3000`。
2. **Authentication → Providers → Email**
   - 公开演示建议**关闭** `Confirm email`，否则每个访客都要收邮件才能登录。
   - 保持开启时，账号只能由管理员在后台手动确认。

## 6. 部署后验收清单

| 步骤 | 命令 / 操作 | 期望 |
|---|---|---|
| 健康检查 | `curl -s https://<域名>/api/health` | `status:"ok"`、`ai.configured:true`、`database.configured:true` |
| 安全头 | `curl -sI https://<域名>/` | 有 CSP（含 `nonce-`）、`strict-transport-security`、`x-frame-options: DENY` |
| 页面 | 打开 `/` 与 `/login` | 样式正常、控制台无 CSP 报错 |
| 登录 | 注册/登录一个账号 | 进入 `/workspace`，侧栏为空态 |
| **流式** | 输入一个问题并提交 | 文字**逐段**出现，不是一次性整段 |
| 落库 | 刷新页面 | 会话与回答完整恢复 |
| 越权 | 第二个账号访问第一个账号的会话 URL | 返回 404 |
| 片段 | 从回答保存片段 → `/snippets` | 列表可见、搜索命中 |

流式那一条是重点：Vercel 的网关可能缓冲 SSE。代码已设置 `Cache-Control: no-cache, no-transform` 与 `X-Accel-Buffering: no`，但**只有线上实测能确认**。

## 7. 部署风险

| 风险 | 影响 | 处理 |
|---|---|---|
| Vercel 缓冲 SSE | 演示时整段文字一次冒出 | 已加防缓冲头；若仍出现，改用 `runtime = "edge"` 或缩短输出 |
| 函数超时 | 长回答被截断 | 路由已设 `maxDuration = 60`；Hobby 上限 60s |
| 免费项目休眠 | 演示当天数据库连不上 | 演示前 24 小时唤醒并跑一次健康检查 |
| 冷启动 | 首字延迟 1–3s | 演示前预热一次 `/api/health` 与首页 |
| 多实例限流 | 实际额度 = 配置 × 实例数 | 单演示场景影响可忽略，已写入限制 |
| 环境变量漏配 | 登录成功但页面 500 | `/api/health` 的 `database.configured` 会直接暴露 |

## 8. 回滚

Vercel 保留每次部署。**Deployments → 选上一个 → Promote to Production** 即可回滚，不需要改代码。

数据库迁移没有自动回滚：`0001`–`0004` 都是增量且幂等，回滚应用版本时表结构保持向前兼容，不要手动删表。

## 9. 本次部署记录（2026-11-04）

| 项 | 值 |
|---|---|
| 生产域名 | **https://codepilot-ai-chi.vercel.app** |
| 部署 ID | `codepilot-fd67r82j5-jodrell.vercel.app` |
| Vercel 项目 | `jodrell/codepilot-ai` |
| 生产环境变量 | 5 个（未配置 `SUPABASE_SECRET_KEY`） |
| 构建耗时 | 首次 4m11s，二次 43s |
| 源码仓库 | https://github.com/X331746604/codepilot-ai （私有，已连接 Vercel 自动部署） |

线上实测结果：

| 检查 | 结果 |
|---|---|
| `GET /api/health` | 200，`ai.configured:true`、`database.configured:true`、`model:qwen-plus` |
| 首页 | 200，1.7s |
| CSP | 含 `nonce-` 与 `strict-dynamic`，`script-src` 无 `unsafe-inline` |
| HSTS | `max-age=63072000; includeSubDomains; preload` |
| 登录 | 真实账号登录成功，进入 `/workspace` |
| **流式** | 首个增量 **1.7s**，共 **17 次**增长，**10.9s** 完成 601 tokens —— **未被网关缓冲** |
| 渲染 | 三栏布局、代码高亮、真实用量 `qwen-plus · 10.9 s · 601 tokens` 均正常 |
| 截图 | `docs/screenshots/08-deployed.png` |

两个部署后才发现并修掉的问题：

1. 顶栏与侧栏仍写着「单用户模式 · 尚未做用户隔离」——认证早就接入了，已改为「数据按账号隔离 · 仅自己可见」并移除顶栏徽标。
2. 本机**直连 `*.vercel.app` 被重置**，所有线上验证都经 `127.0.0.1:7897` 代理完成。国内网络访问该域名同样需要代理，这是演示时要注意的前提。

### 仍需在 Supabase 完成的一步

`Authentication → URL Configuration` 里 `Site URL` 仍是 `http://localhost:3000`。要改成 `https://codepilot-ai-chi.vercel.app`，并在 Redirect URLs 追加 `https://codepilot-ai-chi.vercel.app/**`。

密码登录不依赖这一项，但**注册确认邮件**会跳回 localhost，必须在正式演示前改掉。
