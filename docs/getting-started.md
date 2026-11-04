# 完整使用流程

从一台干净的机器开始，到能在浏览器里完成一次真实生成。分三段：**准备环境 → 跑起来 → 日常使用**。部署相关见 [deployment.md](deployment.md)。

---

## 第一段：准备环境（约 15 分钟）

### 1. 安装依赖

要求：Node ≥ 20.9，包管理器版本由 `package.json` 的 `packageManager` 固定为 pnpm 12.15.0。

```bash
cd C:/Users/asus/WorkBuddy/2026-10-28-21-14-03
pnpm install
```

> 如果命令行提示 `pnpm 不是内部或外部命令`：pnpm 可能不在系统 PATH。WorkBuddy 内置的路径是
> `C:\Users\asus\.workbuddy\binaries\node\versions\22.22.2-6\pnpm.cmd`，用绝对路径调用即可。

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

需要填 5 个值（`SUPABASE_SECRET_KEY` **不是运行必需的**，只有跑脚本/建测试账号时才用）：

| 变量 | 从哪里拿 |
|---|---|
| `AI_API_KEY` | 阿里云百炼控制台创建 DashScope Key（`sk-` 开头） |
| `AI_BASE_URL` | 固定 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `AI_MODEL` | `qwen-plus` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API / Connect 面板 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys → Publishable key（`sb_publishable_`） |

`.env.local` 已被 `.gitignore` 排除，不会进版本库。

### 3. 建数据库（Supabase）

新建项目后，打开 **SQL Editor**，**按顺序**执行四份迁移（每份都幂等，可重复跑）：

| 顺序 | 文件 | 作用 |
|---|---|---|
| 1 | `supabase/migrations/0001_init.sql` | `conversations` / `messages` + 触发器 + 开启 RLS |
| 2 | `supabase/migrations/0002_snippets.sql` | `snippets` 表 |
| 3 | `supabase/migrations/0003_search_indexes.sql` | `pg_trgm` 与分页索引（只影响性能） |
| 4 | `supabase/migrations/0004_auth.sql` | `profiles` 表 + 注册触发器 + owner 策略 + 外键 |

成功标志：**Table Editor** 里能看到 `conversations`、`messages`、`snippets`、`profiles` 四张表。

> `0004` 会删除 `owner_id` 为空的历史数据（接入认证前的测试数据）。全新项目没有数据，无需担心。

### 4. 配置登录方式

Supabase → **Authentication**：

| 设置 | 本地开发建议 |
|---|---|
| URL Configuration → Site URL | `http://localhost:3000` |
| Redirect URLs | `http://localhost:3000/**`、`http://127.0.0.1:3000/**` |
| Sign In / Providers → Email → Confirm email | **关闭**（否则注册后要收邮件点链接） |

### 5. 自检（可选，但建议）

```bash
pnpm verify:migrations     # 用本地 PGlite 跑完四份迁移并验证 RLS，15 项
node scripts/verify-supabase.mjs   # 真实库读写自检，需 SUPABASE_SECRET_KEY
```

---

## 第二段：跑起来

### 6. 启动开发服务器

国内网络访问 Supabase 需要代理（直连会被重置）。把代理端口换成你自己的：

```bash
NODE_USE_ENV_PROXY=1 \
HTTPS_PROXY=http://127.0.0.1:7897 \
HTTP_PROXY=http://127.0.0.1:7897 \
NO_PROXY=".aliyuncs.com,localhost,127.0.0.1" \
pnpm dev
```

`NO_PROXY` 里的 `.aliyuncs.com` 很关键：模型服务在国内，走代理反而会失败。

打开 **http://localhost:3000**，先看 `/api/health`：

```json
{ "status": "ok", "ai": { "configured": true }, "database": { "configured": true } }
```

两项都是 `true` 才说明配置齐了。

### 7. 注册并登录

- 首次使用点「注册」，填邮箱与密码（至少 6 位）。
- 若 `Confirm email` 没关，需要去邮箱点确认链接；链接会跳回 `Site URL`。
- 登录成功后进入 `/workspace`。

> 目前**没有找回密码**功能，忘记密码只能在 Supabase → Authentication → Users 里重置。

---

## 第三段：日常使用

### 8. 四类任务

工作台顶部四个标签，共用一套输入与结果结构：

| 任务 | 输入什么 | 输出结构 |
|---|---|---|
| **生成代码** | 需求描述；可选「额外约束」 | 思路 / 代码 / 依赖与运行 |
| **解释代码** | 粘贴代码；可选「关注点」 | 它做什么 / 关键步骤 / 注意点 |
| **分析错误** | 代码 + **报错信息（必填）** + 可选环境 | 可能原因 / 定位 / 修复后代码 / 验证步骤 |
| **重构代码** | 粘贴代码 + 勾选目标（命名/拆分/去重/可读性/性能） | 改动点 / 重构后代码 / 行为差异 |

操作要点：

- **语言下拉框决定输出语言**，不是文本里写的语言。文本写「用 Python」但下拉停在 TypeScript，模型会按 TypeScript 输出。
- `Cmd/Ctrl + Enter` 直接提交。
- 生成过程中按钮变成「停止」，点它会保留已生成的部分并标记「已停止」。
- 失败时（400/429/断网）会显示错误横幅，且**不清空已输入内容**，可点「重新生成」。

### 9. 会话

- 左侧「新建会话」开始一轮新对话；不新建则默认延续当前会话。
- 后续提问会带上历史：服务端按「最近 10 条 / 单条 4000 字 / 总量 24000 字」裁剪，被裁剪时消息旁会显示「上下文已裁剪」。
- 侧栏支持按标题搜索、按「全部 / 近 7 天 / 近 30 天」筛选、滚到底自动加载更多。
- 会话支持重命名与删除（删除需二次确认，消息级联删除）。
- **刷新页面内容仍在**：会话与消息都在数据库里。

### 10. 代码片段

- 每条回答下方有「保存片段」，会自动抽取第一段代码块，标题取提问首行。
- 左侧「代码片段」进入 `/snippets`：支持搜索（标题与代码正文）、语言筛选、复制、编辑、删除。
- 片段是独立资产：删掉原会话，片段仍保留。

### 11. 设置

`/settings` 分两类：

| 类型 | 内容 | 存在哪 |
|---|---|---|
| 账号偏好 | 默认语言 | `profiles` 表，跟随账号、换设备仍在 |
| 本机偏好 | 默认任务类型、采样温度、流式开关、主题 | `localStorage`，只跟浏览器 |

温度默认 0.3（代码场景偏保守）。关掉流式后上游改非流式，但界面仍按同一套事件处理，只是首字延迟变长。

---

## 第四段：质量自检（开发时）

```bash
pnpm verify            # typecheck + lint + 220 个单测
pnpm test:e2e          # 端到端（需要数据库；主链路默认跳过）
E2E_REAL=1 pnpm test:e2e --grep 主链路   # 真实模型 + 真实落库
pnpm scan:secrets      # 扫仓库与构建产物中的密钥
pnpm audit --prod      # 生产依赖审计（需官方源，见 docs/security.md）
```

---

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面能开，但点任何按钮都没反应 | dev 资源被跨源拦截（Next 16 默认行为），hydration 没完成 | 用 `127.0.0.1` 或 `localhost` 与 `allowedDevOrigins` 保持一致；看控制台是否有 `/_next/hmr` 报错 |
| 接口 401 / 一直跳登录页 | 会话 cookie 无效，或代理断了导致 `getUser()` 失败 | 清 cookie 重登；确认 `/api/health` 与代理 |
| 注册后登录提示邮箱未确认 | Confirm email 开着 | 后台手动确认，或关掉该选项 |
| `PGRST205` / 表不存在 | 迁移没执行或没按顺序 | 重跑 `0001`–`0004` |
| `503 CONFIG` | Vercel/本地缺环境变量 | 看 `/api/health` 的 `missing` 字段 |
| 429 | 限流（默认 10 次/分钟、60 次/小时） | 等一分钟；限流按 IP、进程内计数 |
| 首字很慢（>10s） | 模型冷启动或网络 | 再试一次；长回答可关流式观察差异 |
| 回答里出现「已裁剪」 | 历史超出预算 | 正常行为，避免成本失控 |

---

## 一句话总结

**装依赖 → 填 5 个变量 → 跑 4 份 SQL → 关 Confirm email → `pnpm dev` → 注册 → 四类任务 → 保存片段 → 设置调参。**
