# CodePilot AI

面向个人开发者的 AI 编程工作台：生成代码、解释陌生实现、分析报错、重构代码，四条路径共用同一套输入与结果结构，会话与代码片段留在同一个地方。

## 技术栈

Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase（Postgres + Auth）· 通义千问（OpenAI 兼容模式）· Vitest · Playwright

## 架构

```mermaid
flowchart LR
  B[浏览器] -->|HTTPS| P[proxy.ts<br/>会话乐观检查 + CSP nonce]
  P --> R[App Router<br/>页面 / Route Handler]
  R -->|publishable key<br/>+ 用户 access token| S[(Supabase<br/>Postgres + Auth)]
  S -.->|RLS: owner_id = auth.uid()| S
  R -->|OpenAI 兼容协议<br/>SSE 流式| Q[DashScope<br/>qwen-plus]
  R -->|SSE: meta / delta / done / error| B
```

三条边界：

1. **请求路径上没有 secret key**。数据库访问一律用用户 token，RLS 是最后一道闸；即使某处忘了写 owner 过滤，也读不到别人的行。
2. **历史与落库在服务端**。客户端只传 `conversationId`，上下文由数据库读出并按预算裁剪，不信任客户端声明。
3. **流式是单向 SSE**。四个任务共用 `meta / delta / done / error` 四种事件，前端解析逻辑只有一份。

## 快速开始

```bash
pnpm install
cp .env.example .env.local   # 填入模型与数据库配置
pnpm dev                     # http://localhost:3000
```

`.env.local` 需要两类配置：模型服务（`AI_API_KEY` 等）与 Supabase（`NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SECRET_KEY`）。完整变量清单见 `.env.example`。

数据库需要按顺序执行 `supabase/migrations/` 下的四个文件（Schema → 片段表 → 搜索索引 → 认证与 RLS），详见 [docs/database.md](docs/database.md)。首次使用需要注册一个账号，见 [docs/auth.md](docs/auth.md)。

> **本机注意**：Node 不读系统代理。若访问 Supabase 需要代理，启动时要显式带上：
>
> ```bash
> NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
> NO_PROXY=".aliyuncs.com,localhost,127.0.0.1" pnpm dev
> ```
>
> `NO_PROXY` 不能省——否则国内的模型服务也会被绕出国。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建与启动 |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | 单元 + 组件测试（220 个用例，约 16 秒） |
| `pnpm test:coverage` | 带覆盖率，低于阈值失败 |
| `pnpm test:e2e` | 冒烟 e2e（不依赖数据库与模型） |
| `pnpm verify:migrations` | 用 PGlite 跑全部迁移并验证 RLS（无需网络） |
| `pnpm scan:secrets` | 扫描仓库与构建产物中的密钥（需先 build） |
| `pnpm verify` | typecheck + lint + test，提交前跑这个 |

测试的范围、阈值与明确未覆盖的部分见 [docs/testing.md](docs/testing.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 需求与验收标准 |
| [docs/ai-api.md](docs/ai-api.md) | 四个 AI 接口与流式协议、错误分类 |
| [docs/database.md](docs/database.md) | 表结构、索引与迁移 |
| [docs/auth.md](docs/auth.md) | 认证方案、RLS 策略、越权测试与限制 |
| [docs/testing.md](docs/testing.md) | 测试分层、覆盖率、未覆盖清单 |
| [docs/security.md](docs/security.md) | 依赖审计、CSP 与响应头、密钥扫描、残余风险 |
| [docs/deployment.md](docs/deployment.md) | Vercel 部署步骤、环境变量、验收清单与回滚 |
| [docs/environment-check.md](docs/environment-check.md) | 本机环境核查记录 |

## 部署

目标平台是 Vercel Hobby。生产环境**只需要 5 个变量**：`AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`——`SUPABASE_SECRET_KEY` 只在本地脚本里用，不要配到生产。

完整步骤、Supabase 需要同步修改的两处设置、部署后验收清单与回滚方式见 [docs/deployment.md](docs/deployment.md)。

> 当前状态：**已部署** → https://codepilot-ai-chi.vercel.app （2026-11-04）
>
> 国内网络直连 `*.vercel.app` 会被重置，访问演示需要代理；这与应用本身无关。Supabase 的 Site URL 尚待改成该域名，否则注册确认邮件会跳回 localhost。

## 测试记录

最近一次全量执行（2026-11-04，本地）：

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | **220 passed / 18 files**，约 16 s |
| `pnpm test:coverage` | 通过阈值：行 **95.9%**、分支 **83.5%**、函数 94.3% |
| `pnpm test:e2e` | **24 passed / 1 skipped**（2026-11-03 全量，约 3 min）；11-04 新增的 CSP hydration 用例已在生产模式单独通过 |
| `E2E_REAL=1 pnpm test:e2e --grep 主链路` | 通过，14.6 s，真实模型 + 真实数据库写入 |
| `E2E_PROD=1 … --grep 安全响应头` | 通过：生产模式下无 `unsafe-eval`、有 HSTS 与 `upgrade-insecure-requests` |
| `E2E_PROD=1 … --grep "CSP 下脚本仍然执行"` | 通过：生产模式下主题切换可用，证明 hydration 未被 CSP 阻断 |
| `pnpm verify:migrations` | 15/15（PGlite 跑完 0001–0004 并验证 RLS） |
| `pnpm scan:secrets` | 540 文件，0 命中 |
| **线上** `GET /api/health` | 200，模型与数据库均 `configured: true` |
| **线上流式** | 首字 1.7s、17 次增量、10.9s 完成 601 tokens，未被缓冲 |
| `pnpm audit --prod` | 0 漏洞 |

## 已知限制

- **注册需要邮箱确认**：Supabase 默认开启 Confirm email，注册后要点邮件里的链接才能登录。要做公开演示需在后台关掉该选项。
- **没有找回密码**：个人项目未接邮件通道，忘记密码只能在 Supabase 后台重置。
- **偏好分两处**：默认语言在 `profiles` 表（跟随账号），主题/温度/流式开关在 `localStorage`（跟随浏览器）。
- **限流按 IP 而非账号**：同一出口 IP 的多个账号共享额度。
- **限流是进程内内存计数**：多实例部署时每个实例独立计数，真实上限 = 配置值 × 实例数。
- **上下文预算按字符而非 token 计**：24000 字符是成本护栏，不是精确计费。
- **代码块提取用正则**：回答里若出现教人写 ` ``` ` 的内容会切分错误。
- **未部署**：目前只在本地运行，没有线上链接（任务 15）。
- **开发依赖仍有 3 条安全公告**：都在测试/构建工具链里，部署产物零已知漏洞，详见 [docs/security.md](docs/security.md)。
