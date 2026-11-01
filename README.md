# CodePilot AI

面向个人开发者的 AI 编程工作台：生成代码、解释陌生实现、分析报错、重构代码，四条路径共用同一套输入与结果结构，会话与代码片段留在同一个地方。

## 技术栈

Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase（Postgres）· 通义千问（OpenAI 兼容模式）· Vitest · Playwright

## 快速开始

```bash
pnpm install
cp .env.example .env.local   # 填入模型与数据库配置
pnpm dev                     # http://localhost:3000
```

`.env.local` 需要两类配置：`AI_API_KEY`（模型服务）与 `SUPABASE_URL` / `SUPABASE_SECRET_KEY`（数据库）。数据库建表见 [docs/database.md](docs/database.md)。

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
| `pnpm test` | 单元 + 组件测试（162 个用例，约 12 秒） |
| `pnpm test:coverage` | 带覆盖率，低于阈值失败 |
| `pnpm test:e2e` | 冒烟 e2e（不依赖数据库与模型） |
| `pnpm verify` | typecheck + lint + test，提交前跑这个 |

测试的范围、阈值与明确未覆盖的部分见 [docs/testing.md](docs/testing.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 需求与验收标准 |
| [docs/ai-api.md](docs/ai-api.md) | 四个 AI 接口与流式协议、错误分类 |
| [docs/database.md](docs/database.md) | 表结构、索引、迁移与 RLS 现状 |
| [docs/testing.md](docs/testing.md) | 测试分层、覆盖率、未覆盖清单 |
| [docs/environment-check.md](docs/environment-check.md) | 本机环境核查记录 |

## 已知限制

- **单用户模式**：没有账号体系，数据库的 RLS 已开启但零策略（等价于"全部拒绝"），只有服务端能访问。多用户隔离是后续任务。
- **限流是进程内内存计数**：多实例部署时每个实例独立计数，真实上限 = 配置值 × 实例数。
- **上下文预算按字符而非 token 计**：24000 字符是成本护栏，不是精确计费。
- **代码块提取用正则**：回答里若出现教人写 ` ``` ` 的内容会切分错误。
- **未做账号、未部署**：目前只在本地运行。
