# 数据库设计说明（任务 8 第一部分产出）

## 1. 当前状态

| 项 | 状态 |
|---|---|
| Schema 设计 | ✅ 完成，见 `supabase/migrations/0001_init.sql` |
| 建表 SQL 执行 | ✅ 已在真实 Supabase 项目执行 |
| 连通性自检 | ✅ `node scripts/verify-supabase.mjs` 8/8 通过 |
| 数据访问层 | ✅ `src/lib/db/*` |
| 会话接口 | ✅ `/api/conversations`（列表/新建/重命名/删除/消息） |
| UI 接入（侧栏会话列表） | ✅ 新建 / 切换 / 重命名 / 删除 + 刷新恢复 |
| 搜索与分页 | ✅ 游标分页 + 标题搜索 + 时间范围（见 §8） |
| 认证与 RLS 策略 | ⏳ `0004_auth.sql` 已写好，待执行（见 [auth.md](auth.md)） |

### 持久化的职责划分

**服务端写入，客户端只读**：

```
POST /api/ai/*  ──▶ 定位或创建会话
                ──▶ 读历史（数据库）
                ──▶ 写入用户消息
                ──▶ 流式调用模型
                ──▶ 写入助手消息（内容 + 真实 usage + 耗时）
                ──▶ meta 事件里返回 conversationId
```

这样设计的原因：客户端可以在中途刷新、断网、甚至伪造请求，而数据库里的记录始终与应用实际看到的历史一致。**历史不再由客户端声明**。

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

### 当前实现的取舍

`src/lib/db/conversations.ts` 的 `appendMessage` 采用「先查 max(seq) 再插入」的两步写法，因为 Supabase JS 客户端无法直接执行上面的 SQL。并发写同一条会话时，唯一约束会拒绝其中一个请求，代码对 `23505` 做最多 3 次重试。

单用户场景下这足够；如果将来并发上升，正确做法是在数据库里加一个函数，用 `update conversations set message_count = message_count + 1 returning message_count` 分配序号——行锁天然串行化，不需要重试。

## 4. RLS 的当前语义

已对两张表 `enable row level security`，但**没有建任何策略**。

这不是遗漏，而是刻意的：Postgres 的 RLS 在没有任何策略时等价于「全部拒绝」。因此现在只有持有 `service_role` 的服务端代码能读写，任何匿名客户端（哪怕拿到 anon key）都读不到数据。任务 13 加策略时，是往"默认拒绝"之上叠加允许规则，而不是把"默认允许"改成拒绝——这个顺序更安全。

## 5. 接入清单（需要你操作，约 5 分钟）

> **注意**：Supabase 在 2025–2026 年改版了密钥体系，**旧教程里的「Settings → API」页面已经不存在**。
> 现在密钥统一在 **Settings → API Keys**，并分为「新版 secret key」与「旧版 service_role」两套。
> 两者都能用，脚本对两种都做了适配。

1. 打开 https://supabase.com ，用 GitHub 登录，创建新项目。
   - 区域选 **Singapore**（离国内最近）
   - 数据库密码自行保存（本项目服务端不直接用它）
2. 建表：左侧栏 **SQL Editor**（图标像命令行提示符）→ New query → 粘贴 `supabase/migrations/0001_init.sql` 全文 → **Run**。
   - 成功标志：左侧 Table Editor 里出现 `conversations` 与 `messages` 两张表。
3. 取密钥，二选一：

   **路线 A（新版，推荐）**
   - 左下角齿轮 **Project Settings → API Keys**
   - 切到 **「Publishable and secret API keys」** 标签
   - 若显示 `Create new API keys` 按钮，先点它（不会影响旧密钥）
   - 复制 **Secret keys** 里的值，形如 `sb_secret_xxxxxxxx`

   **路线 B（旧版，兼容）**
   - 同页面切到 **「Legacy API Keys」** 标签
   - 复制 **`service_role`** 那一行的值，形如 `eyJhbGciOi...`（一长串 JWT）

4. 项目 URL：同一页面顶部，或 **Project Settings → General → Project URL**，形如 `https://abcd1234.supabase.co`。
5. 把这两个值填进 `.env.local`（或直接发给我）：

```bash
SUPABASE_URL=https://xxxx.supabase.co
# 新版密钥用这个变量名：
SUPABASE_SECRET_KEY=sb_secret_...
# 旧版密钥用这个变量名：
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

6. 我随后执行 `node scripts/verify-supabase.mjs` 做真实读写自检（写一条会话与消息、读回、删除并确认级联）。

> **安全提醒**：secret key / service_role 等同于数据库管理员权限，绕过所有 RLS。不要提交到 Git、不要加 `NEXT_PUBLIC_` 前缀、不要放进任何客户端组件。`.env.local` 已被 `.gitignore` 排除。

## 6. 本地开发必须注意：Node 不走系统代理

首次执行自检时连接被重置（`ECONNRESET`），但浏览器能正常打开 Supabase 控制台。原因是：

- 浏览器走的是系统代理 / 代理插件；
- **Node 和 curl 默认都不读系统代理**，直连 `*.supabase.co` 会被阻断。

解决办法是给进程显式指定代理。本机实测可用端口为 `7897`（Clash 系默认混合端口）：

```bash
# 单次执行脚本
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 node scripts/verify-supabase.mjs
```

`NODE_USE_ENV_PROXY=1` 是 Node 22+ 提供的开关，作用是让内置 `fetch` 读取 `HTTPS_PROXY`。不加这个变量，`HTTPS_PROXY` 对 Node 完全无效（这是最容易卡住的地方）。

启动开发服务器同理：

```bash
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 pnpm dev
```

**部署到 Vercel 后不需要任何代理设置**——那里是直连。这段只影响本地开发。

## 7. 迁移文件的维护约定

- 文件命名 `NNNN_描述.sql`，按序号执行，**不修改已执行的迁移**；
- 每次结构变更新增一个文件，而不是改 `0001`；
- 幂等写法（`if not exists`、`drop trigger if exists`）优先，便于在测试库反复执行；
- 真实项目应使用 Supabase CLI 的迁移工作流，本项目为降低学习成本采用"SQL Editor 手工执行 + 仓库留档"。

## 7.5 认证相关变更（`0004_auth.sql`）

这一份改动最多，单独说明：

1. **新增 `profiles` 表**：主键即 `auth.users.id`，存邮箱快照、默认语言、创建时间。
   注册时由 `handle_new_user()` 触发器自动建档（`security definer`，因为 anon 没有 insert 权限）。
2. **三张业务表的 `owner_id` 改为 `not null` 且默认 `auth.uid()`**。
   接入认证前产生的数据无法归属，迁移里直接删除——留着只会变成谁都读不到也删不掉的幽灵行。
3. **四类操作各建一条策略**，条件统一是 `owner_id = auth.uid()`；
   `messages` 的 insert 额外用 `exists` 校验父会话归属。
4. **索引最左列改成 `owner_id`**：现在所有查询都带用户过滤，原索引用不上。

策略的设计理由与越权返回码的选择见 [docs/auth.md](docs/auth.md)。

## 8. 分页与搜索索引（`0003_search_indexes.sql`）

### 为什么是游标而不是 offset

会话列表按 `last_message_at desc` 排序，而这个字段**每发一条消息就会变**。用 `offset` 翻页时，顶部插入一条新记录会让所有结果整体后移一格，用户在第二页会再次看到第一页末尾那条。游标记的是"上一页最后一条的排序键"，翻页从那个位置继续往后扫，不受插入影响。

游标载荷是 `last_message_at`（片段用 `created_at`）+ `id`。之所以带上主键：时间戳可能完全相同（触发器写入的是消息的 `created_at`，同一毫秒的两条会话完全可能撞上），只比时间戳会漏掉或重复边界记录。展开成 PostgREST 能表达的形式就是：

```
last_message_at.lt.<ts>,and(last_message_at.eq.<ts>,id.lt.<id>)
```

对应的索引必须与排序键同序，否则用不上：

```sql
create index conversations_cursor_idx on public.conversations (last_message_at desc, id desc);
```

### 为什么需要 pg_trgm

`title ilike '%关键词%'` 有前置通配符，B-tree 索引完全无效，只能顺序扫描。`pg_trgm` 把文本切成三元组建 GIN 索引，`ilike '%词%'` 才能走索引。代码片段表的 `code` 也建了同样的索引——它最长 20000 字，索引体积会明显更大，这是"能搜代码内容"的必要成本；如果更在意存储可以删掉这一条，功能不受影响，只是退化为顺序扫描。

### 这三条索引的定位

**只影响性能，不影响正确性**。晚于代码执行不会造成功能不可用，只是数据量上来后变慢。当前数据量（几十条）下差异感知不到，属于"为将来准备"。

### 已知限制

- 排序键可变，翻页期间若有新消息写入，按游标继续读可能与已加载部分重叠。客户端按 id 去重兜住（`use-conversations` / `use-snippets` 都做了），代价是一次 O(n) 遍历。
- 没有总数：为了一个数字多跑一次 `count(*)` 不划算，界面用「是否还有下一页」代替。
- 搜索是 `ilike` 子串匹配，不做分词，中文按整串匹配。
