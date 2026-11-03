# CodePilot AI

面向个人开发者的 AI 编程工作台：生成代码、解释陌生实现、分析报错、重构代码，四条路径共用同一套输入与结果结构，会话与代码片段留在同一个地方。

## 技术栈

Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase（Postgres + Auth）· 通义千问（OpenAI 兼容模式）· Vitest · Playwright

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
| [docs/environment-check.md](docs/environment-check.md) | 本机环境核查记录 |

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
