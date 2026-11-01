# 数据库设计说明（任务 8 第一部分产出）

## 1. 当前状态

| 项 | 状态 |
|---|---|
| Schema 设计 | ✅ 完成，见 `supabase/migrations/0001_init.sql` |
| 建表 SQL 可执行性 | ⏳ 待在有凭据后实际执行 |
| 数据访问层（API Route / 仓储） | ⏳ 未开始（等数据库可连通） |
| UI 接入（侧栏会话列表） | ⏳ 未开始 |

**为什么不先写代码**：项目规则要求「涉及数据库的功能必须实际验证数据读写」。本机没有 Supabase 凭据、没有 Docker、没有本地 Postgres，任何数据层代码写完都无法验证，只能靠推测——一旦有字段或权限问题，排查成本会远高于先建表再写代码。

## 2. 表结构概要

### conversations

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `owner_id` | uuid null | 单用户阶段为空；任务 13 起写入 `auth.uid()` 并改为 not null |
| `title` | text | 1–60 字符，默认「新会话」 |
| `task_type` | text | 四类任务之一，check 约束 |
| `language` | text | 编程语言标识 |
| `created_at` / `updated_at` / `last_message_at` | timestamptz | 侧栏按 `last_message_at` 倒序 |

索引：`(owner_id, last_message_at desc)` —— 侧栏的唯一查询模式。

### messages

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | |
| `conversation_id` | uuid FK | `on delete cascade` |
| `seq` | integer | 会话内自增序号，`unique(conversation_id, seq)` |
| `role` | text | `user` / `assistant` |
| `content` | text | 消息正文 |
| `task_type` / `language` | text | 冗余存储，便于单条回溯 |
| `status` | text | `ok` / `partial` / `error` |
| `error_category` | text null | 对应八类错误码 |
| `usage` | jsonb null | 真实 token 用量 |
| `latency_ms` | integer null | 端到端耗时 |

索引：`(conversation_id, seq)`。

### 触发器

`messages` 插入后自动更新所属会话的 `last_message_at` 与 `updated_at`。

**为什么放数据库层**：任何写入路径（含未来可能的批量导入、后台补偿任务）都不会漏掉这两个字段。放在应用层则每加一条写入路径就要记得补一次。

## 3. 为什么用 `seq` 而不是只靠 `created_at`

- 同一毫秒内写入两条消息时，`created_at` 相同，排序结果不确定；
- 多轮对话的顺序是语义的一部分（上下文拼接依赖它），不能靠"一般不会同时"来赌；
- 客户端已有 `exchanges` 的顺序，落库时直接取 `coalesce(max(seq),0)+1`。

写入语句（单条 SQL 完成，避免并发下的重号）：

```sql
insert into public.messages (conversation_id, seq, role, content, task_type, language, status)
select $1, coalesce(max(seq), 0) + 1, $2, $3, $4, $5, $6
  from public.messages
 where conversation_id = $1;
```

## 4. RLS 的当前语义

已对两张表 `enable row level security`，但**没有建任何策略**。

这不是遗漏，而是刻意的：Postgres 的 RLS 在没有任何策略时等价于「全部拒绝」。因此现在只有持有 `service_role` 的服务端代码能读写，任何匿名客户端（哪怕拿到 anon key）都读不到数据。任务 13 加策略时，是往"默认拒绝"之上叠加允许规则，而不是把"默认允许"改成拒绝——这个顺序更安全。

## 5. 接入清单（需要你操作，约 5 分钟）

1. 打开 https://supabase.com ，用 GitHub 登录，创建新项目。
   - 区域选 **Singapore**（离国内最近）
   - 数据库密码请自行保存好（本项目的服务端连接不直接用它）
2. 项目创建完成后，进入 **Project Settings → API**，复制两个值：
   - `Project URL`（形如 `https://xxxx.supabase.co`）
   - `service_role` 密钥（在 `Project API keys` 里，标注 `secret`）
3. 打开 **SQL Editor**，把 `supabase/migrations/0001_init.sql` 全文粘贴进去并 Run。
4. 把这两个值发给我，或者你自己填进 `.env.local`：

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

5. 我随后执行 `node scripts/verify-supabase.mjs` 做真实读写自检（写一条会话与消息、读回、删除并确认级联）。

> **安全提醒**：`service_role` 密钥等同于数据库管理员权限，不要提交到 Git、不要贴进聊天以外的公开场合。`.env.local` 已被 `.gitignore` 排除。

## 6. 迁移文件的维护约定

- 文件命名 `NNNN_描述.sql`，按序号执行，**不修改已执行的迁移**；
- 每次结构变更新增一个文件，而不是改 `0001`；
- 幂等写法（`if not exists`、`drop trigger if exists`）优先，便于在测试库反复执行；
- 真实项目应使用 Supabase CLI 的迁移工作流，本项目为降低学习成本采用"SQL Editor 手工执行 + 仓库留档"。
