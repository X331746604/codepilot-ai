# 安全复查

任务 14 的产出。目标是把「凭感觉觉得安全」变成「有命令、有输出、有明确边界的结论」。

## 0. 结论摘要

| 项 | 结果 |
|---|---|
| 生产依赖漏洞 | **0**（`pnpm audit --prod`） |
| 开发依赖漏洞 | 10 → **3**（2 critical、1 high 已清除，剩 0 critical / 0 high） |
| 仓库与构建产物密钥泄露 | **0**（扫描 539 个文件、2 条真实密钥值、3 条形态规则） |
| 脚本 CSP | **nonce + strict-dynamic，无 `unsafe-inline`** |
| 认证 / 越权 | 未登录 401/跳登录；跨账号接口 404、直连 PostgREST 返回 `[]`（任务 13 已验证） |
| 覆盖 | 单测 220、e2e 24（含 2 条安全头用例，1 条主链路默认跳过） |

## 1. 范围

**在范围内**：依赖漏洞、密钥与构建产物、HTTP 响应头与 CSP、认证与授权边界、输入校验、日志内容。

**不在范围内**（第 8 节逐条列为残余风险）：渗透测试、SAST/DAST 工具链、DDoS/WAF、供应链签名、邮件通道、多因素认证。

## 2. 依赖审计

`pnpm audit` 默认走 `registry.npmmirror.com`，该镜像**没有实现 audit 端点**，会报 `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`。要指向官方源并让 pnpm 走代理：

```bash
pnpm --config.https-proxy=http://127.0.0.1:7897 --config.proxy=http://127.0.0.1:7897 \
  audit --prod --registry=https://registry.npmjs.org/
```

### 2.1 修复前后

| 严重度 | 修复前 | 修复后 |
|---|---|---|
| critical | 2 | **0** |
| high | 1 | **0** |
| moderate | 6 | 2 |
| low | 1 | 1 |

修复动作只有一个：**把 vitest 3.2.7 升到 5.1.0**（连带 `@vitest/coverage-v8`）。两个 critical 都来自它依赖的 `tinypool`（原型污染 gadget → RCE），high 来自 `glob` CLI 注入。升级后配置无需改动，220 个用例与覆盖率阈值照常通过。

### 2.2 剩余的 3 项

| 严重度 | 包 | 路径 | 为什么不修 |
|---|---|---|---|
| moderate | `postcss-selector-parser` <6.1.5 | `@tailwindcss/typography` | 只在**构建期**解析我们自己的 CSS，没有攻击者可控输入 |
| moderate | `minimatch` <11.0.1 | `vitest` 覆盖率 / `eslint` | ReDoS 需要攻击者控制 glob 模式；这里模式来自工具配置 |
| low | `deepmerge` ≤4.3.1 | `shadcn` CLI | **无修复版本**；CLI 只在本地生成组件时运行，不参与构建与运行 |

三项全部位于 `devDependencies` 的依赖闭包里。`pnpm audit --prod` 为 **No known vulnerabilities found**，即部署产物不含任何已知漏洞。

## 3. 密钥防泄露（AC-19）

### 3.1 做法

`pnpm scan:secrets`（`scripts/scan-secrets.mjs`）扫两类目标：

1. `git ls-files` 的全部已跟踪文件；
2. 构建产物 `.next/static` 与 `.next/server`。

判定有两条互相补充的依据：

- **已知值比对**：从 `.env.local` 读出密钥类变量（键名含 `SECRET` / `SERVICE_ROLE` / `API_KEY` / `PASSWORD` / `ACCESS_TOKEN`，且长度 ≥16），在文件内容里搜字面值。命中即泄露。
- **形态匹配**：`sk-*`、`sb_secret_*`、JWT。防的是**别的项目**的密钥被误提交。

公开配置不参与比对：`SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`AI_BASE_URL` 本来就是给浏览器或公开的。第一版脚本没区分，把这三项报成了"泄露"——**误报比漏报更容易让人以后直接忽略输出**，所以改成了白名单式收窄。

### 3.2 结果

```
扫描 539 个文件（跳过 32 个二进制/超大文件）
已知密钥值 2 条，形态规则 3 条
未发现密钥泄露
```

构建产物里没有服务端变量：Next 只会把 `NEXT_PUBLIC_*` 内联进客户端包，其余在运行时从 `process.env` 读取。

### 3.3 没有覆盖的部分

- **Git 历史**：只扫当前工作树。若密钥曾被提交又删除，历史里仍在。本项目 `.env.local` 从第一次提交就被 `.gitignore` 排除（`git check-ignore` 验证过），但这条不能靠脚本证明，只能靠当时的操作。
- `node_modules` 不扫（第三方代码，无意义）。
- `.env.local` 自身不扫（它就是存放密钥的地方）。

> `sb_secret_...` 曾出现在开发对话里。项目收尾时应在 Supabase → API Keys 轮换一次，旧密钥即刻失效。

## 4. 响应头与 CSP

### 4.1 头清单

| 头 | 值 | 作用 |
|---|---|---|
| `Content-Security-Policy` | 见下 | 限制脚本/样式/连接来源 |
| `X-Content-Type-Options` | `nosniff` | 禁止 MIME 猜测 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 跨站不带完整路径 |
| `X-Frame-Options` | `DENY` | 老浏览器的不嵌框兜底 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | 关闭用不到的硬件能力 |
| `Cross-Origin-Opener-Policy` | `same-origin` | 隔离窗口引用，缓解 Spectre 类攻击 |
| `X-DNS-Prefetch-Control` | `off` | 不预解析外域 |
| `Strict-Transport-Security` | 仅生产 | 两年 + 子域 + preload |

### 4.2 CSP 的设计取舍

```
default-src 'self';
script-src 'self' 'nonce-<每请求随机>' 'strict-dynamic' [dev: 'unsafe-eval'];
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self' data:;
connect-src 'self' https://<项目>.supabase.co wss://<项目>.supabase.co [dev: ws://127.0.0.1:*];
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
worker-src 'self' blob:; manifest-src 'self';
[prod: upgrade-insecure-requests]
```

三个关键决定：

1. **脚本用 nonce，不用 `unsafe-inline`**。每个 HTML 请求由 `proxy.ts` 生成一个 nonce，Next 会从请求头的 CSP 里解析出来并自动加到框架脚本上。注入的 `<script>` 拿不到 nonce，无法执行。
2. **样式保留 `unsafe-inline`**。Turbopack 的开发态 HMR 会动态插入 `<style>`，next-themes 也会写行内样式；样式注入的危害远小于脚本执行，不值得为它牺牲整站可用性。这是一处**有意识的降级**，不是遗漏。
3. **强制动态渲染**。nonce 必须存在于服务端渲染出的 HTML 里，静态页面在构建期没有请求头，拿不到 nonce。根布局读 `headers()` 并显式 `dynamic = "force-dynamic"`，构建结果所有路由都是 `ƒ`。代价是首页不再预渲染——本项目页面本来就依赖会话态，实际损失很小。

`next-themes` 会在 hydration 前注入一段**内联脚本**设置主题，它拿不到 Next 自动附加的 nonce，因此在根布局里从 `x-nonce` 读出并显式传给 `ThemeProvider`。漏掉这一步，主题会在每次首屏闪一下（脚本被 CSP 拦下）。

### 4.3 验证

`e2e/smoke.spec.ts` 的「安全响应头」两条用例：

- 断言 `script-src` 含 nonce 与 `strict-dynamic`、**不含 `unsafe-inline`**，其余头取值正确；
- 连续两次请求的 nonce 不同，且 HTML 里确实出现 `nonce="<同一个值>"`——只测头不测 HTML 会漏掉"Next 没把 nonce 应用上去"这种情况。

## 5. 认证与授权

详细设计见 [auth.md](auth.md)，这里只列复查结论：

- 请求路径**只用 publishable key + 用户 token**，secret key 不出现在任何路由里。即使某个仓储函数忘了写 owner 过滤，RLS 也不会返回别人的行。
- 三张业务表的策略：`conversations` / `snippets` 比 `owner_id = auth.uid()`；`messages` 没有 `owner_id`，四类操作统一用 `exists` 校验父会话归属。
- 越权返回 **404 而非 403**：403 等于确认"这个 ID 存在"。
- 未登录在**解析请求体之前**就返回 401，不消耗限流额度、不读数据库。

## 6. 输入与输出

| 面 | 措施 |
|---|---|
| 所有外部输入 | Zod 解析后才进入业务层（四个 AI 任务、会话、片段、资料） |
| 请求体大小 | 上限 160 KB，超出 413 |
| 用户代码 | **不执行**（需求 N1），只作为文本送给模型 |
| Markdown 渲染 | `react-markdown` 默认**不解析原始 HTML**，未启用 `rehype-raw` |
| `dangerouslySetInnerHTML` | 业务代码中 **0 处** |
| 文件上传 | 无此功能 |

## 7. 日志

- 模型调用只记元数据：`requestId`、`task`、`model`、token 用量、耗时、`contextMessages`。**不记 prompt 正文，不记密钥**。
- 数据库错误对外统一 `500 DB_ERROR` 中性文案，原始 PostgREST 信息只进服务端日志（截断 300 字）。
- CSP 违规**没有**上报端点，见下节。

## 8. 残余风险

1. **CSP 无 `report-to`**：违规不会上报，只能靠浏览器控制台人工发现。加上报需要额外的收集端点。
2. **限流是进程内内存计数**：多实例部署时每个实例独立计数，真实上限 = 配置值 × 实例数。生产若扩容到多实例，需要换 Redis 或网关限流。
3. **开发依赖仍有 3 条公告**（第 2.2 节），均在构建/测试工具链里，不影响部署产物。
4. **没有 SAST / DAST / 渗透测试**：本轮是人工审查 + 自动化用例，不是专业安全评估。
5. **HSTS 首次访问不生效**：浏览器要先收到一次 HTTPS 响应；preload 列表未提交。
6. **认证侧**：无 MFA、无密码强度策略、无泄露密码库比对；注册需邮箱确认，且**没有找回密码**。
7. **token 过期后需刷新页面**：没做静默刷新后自动重试。
8. **日志里的错误消息可能包含表名/列名**：不含用户数据，但对内暴露了 schema 细节。
9. **Supabase publishable key 是公开的**：这是设计如此，安全性依赖 RLS 而非密钥保密。

## 9. 复现命令

```bash
# 依赖审计（必须走官方源，npmmirror 没有 audit 端点）
pnpm --config.https-proxy=http://127.0.0.1:7897 --config.proxy=http://127.0.0.1:7897 \
  audit --prod --registry=https://registry.npmjs.org/

# 密钥扫描（需先 pnpm build 才能覆盖构建产物）
pnpm build && pnpm scan:secrets

# 响应头与 nonce
pnpm test:e2e --grep "安全响应头"

# 迁移与 RLS 行为
pnpm verify:migrations
```
