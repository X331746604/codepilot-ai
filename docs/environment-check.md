# 环境检查报告（任务 2）

| 项目 | 内容 |
|---|---|
| 文档编号 | CP-ENV-001 |
| 日期 | 2026-10-28 21:20 GMT+8 |
| 对应任务 | 任务 2 / 开发环境检查 |
| 结论 | **基本满足，存在 1 个阻塞项（pnpm 未安装）与 2 个需处理项** |
| 探测方式 | 全部为只读命令 + 1 次最小化真实模型调用（16 tokens） |

---

## 1. 结论速览

| # | 检查项 | 要求 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | Node.js | ≥ 20.9（Next.js 15/16 要求） | **v22.22.2** | ✅ 通过 |
| 2 | npm | 随 Node 提供 | **10.9.7** | ✅ 通过 |
| 3 | corepack | 用于管理 pnpm | **0.34.6** | ✅ 通过 |
| 4 | pnpm | 项目指定包管理器 | **未安装** | ❌ **阻塞** |
| 5 | Git | ≥ 2.30 | **2.55.0.windows.3** | ✅ 通过 |
| 6 | Git 身份 | user.name / user.email 已配置 | 均已配置 | ⚠️ 可用但建议修改 |
| 7 | 磁盘空间 | ≥ 5 GB 可用 | **77 GB 可用（总 302 GB，已用 75%）** | ✅ 通过 |
| 8 | 端口 3000 | 未被占用 | 空闲 | ✅ 通过 |
| 9 | npm 源连通 | 可下载 | 官方 883 KB/s；镜像 **3.0 MB/s** | ✅ 通过（建议用镜像） |
| 10 | GitHub / Supabase / DeepSeek 可达 | HTTP 可达 | 200 / 200 / 401（401 为未鉴权正常响应） | ✅ 通过 |
| 11 | 大模型凭据 | 至少 1 个可用 | **DashScope Key 有效且推理成功** | ✅ 通过（有前提，见 §4） |
| 12 | Supabase 项目 | 需 project URL + anon key | 未配置 | ⏳ 任务 9 前完成 |
| 13 | Vercel 账号 | 部署需要 | 未配置 | ⏳ 任务 15 前完成 |

---

## 2. 阻塞项：pnpm 未安装

**现象**：`pnpm -v` → `command not found`。npm 全局前缀为 `C:\Users\asus\.workbuddy\binaries\node\versions\22.22.2-6`，corepack 可用但未激活 pnpm。

**修复方案 A（推荐，版本可锁定）**：

```bash
corepack enable pnpm
corepack prepare pnpm@latest --activate
pnpm -v
```

**修复方案 B（A 因权限失败时）**：

```bash
npm i -g pnpm@latest --registry=https://registry.npmmirror.com
pnpm -v
```

**注意**：执行前先清空代理变量（见 §3），否则可能长时间无输出。

---

## 3. 需处理项：代理环境变量与 npm 源

**实测**：

| 变量 | 值 |
|---|---|
| `http_proxy` / `https_proxy` / `HTTP_PROXY` / `HTTPS_PROXY` | `http://127.0.0.1:64530` |
| `NO_PROXY` / `no_proxy` | 未设置 |

**代理状态**：本次探测时**该端口可用**（显式 `--proxy` 请求返回 200，HTTPS CONNECT 成功）。但历史上该端口会随会话变化并失效，失效时 `npm install` 表现为**静默卡死数十分钟且无任何输出**，极难定位。

**处置建议（写入任务 3 的执行约定）**：

1. 所有安装命令前先清代理：`unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY`
2. 显式指定镜像：`--registry=https://registry.npmmirror.com`
3. Electron / Playwright 二进制另加对应镜像变量（本项目 Playwright 需要）：
   `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`

**源速对比实测**（`typescript-5.6.3.tgz`，4.17 MB）：

| 源 | 耗时 | 速度 |
|---|---|---|
| registry.npmjs.org（直连） | 4.73 s | 883 KB/s |
| registry.npmmirror.com | 1.39 s | **3.0 MB/s** |

结论：镜像快约 3.4 倍。项目将安装约 400–600 个包，用镜像可把 `pnpm install` 从可能的数分钟压到一分钟内。

---

## 4. 已确认可用：大模型凭据（关键风险 R1 已解除）

### 4.1 凭据存在性

| 变量 | Machine 作用域 | User 作用域 | 当前进程可见 |
|---|---|---|---|
| `DASHSCOPE_API_KEY` | **已设置（len=117）** | 未设置 | **否（null）** |
| `OPENAI_API_KEY` | 未设置 | 未设置 | 否 |
| `DEEPSEEK_API_KEY` | 未设置 | 未设置 | 否 |

### 4.2 真实调用验证（本次实际执行）

| 步骤 | 端点 | 结果 |
|---|---|---|
| 鉴权 + 模型列表 | `GET /compatible-mode/v1/models` | HTTP 200，返回 **183 个** 模型 |
| 真实推理 | `POST /compatible-mode/v1/chat/completions`，`model=qwen-plus`，`max_tokens=8` | HTTP 200，返回 `pong`，**645 ms**，`usage` 完整返回（prompt=15 / completion=1 / total=16） |

**模型可用性核对**：

- `qwen-plus` ✅ 存在
- `qwen-max` ✅ 存在
- `qwen-turbo` ❌ 不在列表（与历史记录一致）
- `deepseek-chat` ❌ 不在该账号的兼容端点列表中

**推论**：`usage` 字段正常返回 → 需求文档 FR-11.7「Token 用量展示」可以用**真实数据**实现，不需要估算。

### 4.3 ⚠️ 必须记录的陷阱：环境变量不继承

`DASHSCOPE_API_KEY` 存在于 **Machine 作用域**，但**当前运行的宿主进程（含所有工具调用）看不到它**——因为该变量是在宿主进程启动之后才写入的，Windows 只对**新建进程**生效。

**后果**：任务 6 写代码时，`process.env.DASHSCOPE_API_KEY` 会是 `undefined`，`next dev` 里拿不到 Key，表现为"AUTH 错误"而非"变量不存在"，容易误判。

**处置**（三选一，任务 6 执行）：

| 方案 | 做法 | 评价 |
|---|---|---|
| A（推荐） | 在本项目 `.env.local` 写入一份（该文件已被 `.gitignore` 排除），值从注册表读取后粘贴 | 项目自包含，团队协作标准做法；需确保不提交 |
| B | 重启终端/开发机使新进程继承 Machine 变量 | 一劳永逸，但当前会话无法验证 |
| C | 每次启动用脚本从注册表注入 | 可在 CI/演示时用，本地略繁琐 |

> 本次验证通过 PowerShell 从注册表读取后仅用于请求头，**全程未打印密钥明文**。

### 4.4 提供方建议（修正需求文档 Q2 的默认值）

原默认值写的是"示例 DeepSeek"，实测该账号的兼容端点**不含 `deepseek-chat`**。建议改为：

- **默认演示 Provider**：DashScope 兼容模式 + `qwen-plus`（已验证可用、成本低、中文好、返回 `usage`）
- **结构上仍保持 Provider 无关**：`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` 三件套不变，换成 OpenAI 或 DeepSeek 官方只需改环境变量

---

## 5. 需处理项：Git 身份

当前全局配置：

```
user.name  = Jodrell Bank
user.email = 3317466046@qq.com
```

**问题**：`user.name` 是项目名而非人名，提交记录在 GitHub 上会显示为该字符串，简历项目里观感不佳；且若邮箱与 GitHub 账号不一致，贡献图不会归集。

**建议**（不阻塞，任务 3 前确认）：

```bash
git config --global user.name "你的姓名拼音或常用 ID"
git config --global user.email "你的 GitHub 绑定邮箱"
```

若该邮箱就是 GitHub 绑定邮箱，则只需改 `user.name`。

---

## 6. 尚未满足 / 尚未验证

| 项 | 状态 | 何时解决 |
|---|---|---|
| pnpm | 未安装 | 任务 3 第 1 步 |
| Supabase 项目（URL + anon key + service_role key） | 未创建 | 任务 9 前 |
| Vercel 账号授权 | 未确认 | 任务 15 前 |
| Playwright 浏览器二进制 | 未安装（约 300 MB） | 任务 12（e2e）前 |
| `qwen-plus` 的流式（SSE）响应行为 | **未验证** | 任务 6，需单独探测 chunk 格式 |
| 长文本（8000 字符输入）的实际耗时与截断行为 | 未验证 | 任务 6 |
| 该 Key 的配额上限与计费方式 | 未知 | 任务 6 前查控制台确认，用于设定限流阈值 |

---

## 7. 对后续任务的影响

1. **任务 3 可直接开始**，前置动作只有一条：装 pnpm（清代理 + 用镜像）。
2. **任务 6 的验证成本极低**——已有可用 Key，不必等申请，可以真实验证四类任务与流式。
3. **需求文档需同步两处修订**：Q2 默认 Provider 由 DeepSeek 改为 DashScope + qwen-plus；§12.1 风险 R1 状态由"未确认"改为"已解除，附条件"。
4. **限流阈值（FR-11.6）需要真实配额数据支撑**，当前为拍脑袋值，任务 6 前补正。
