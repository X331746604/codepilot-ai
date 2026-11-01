-- ============================================================
-- CodePilot AI — 初始 Schema
-- 适用：Supabase PostgreSQL 15+
-- 用法：Supabase 控制台 → SQL Editor → 粘贴整份文件 → Run
-- 幂等：全部使用 if not exists / do $$ 包裹，可重复执行
-- ============================================================

-- ------------------------------------------------------------
-- conversations：会话
-- owner_id 现阶段允许为空（单用户模式）；任务 13 接入认证后
-- 改为 not null，并绑定到 auth.users(id)。
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid null,
  title           text not null default '新会话',
  task_type       text not null,
  language        text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),

  constraint conversations_title_len   check (char_length(title) between 1 and 60),
  constraint conversations_task_type   check (task_type in ('generate', 'explain', 'debug', 'refactor'))
);

comment on table  public.conversations is 'AI 会话。单用户阶段 owner_id 为空，接入认证后写入 auth.uid()';
comment on column public.conversations.last_message_at is '最近一条消息时间，用于侧栏排序；由应用在写入消息后更新';

-- 侧栏查询：按用户取最近会话
create index if not exists conversations_recent_idx
  on public.conversations (owner_id, last_message_at desc);

-- ------------------------------------------------------------
-- messages：消息
-- seq 是会话内自增序号，用于稳定排序（created_at 可能同毫秒）。
-- ------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  seq             integer not null,
  role            text not null,
  content         text not null,
  task_type       text not null,
  language        text not null,
  status          text not null default 'ok',
  error_category  text null,
  usage           jsonb null,
  latency_ms      integer null,
  created_at      timestamptz not null default now(),

  constraint messages_role    check (role in ('user', 'assistant')),
  constraint messages_status  check (status in ('ok', 'partial', 'error')),
  constraint messages_seq_pos check (seq > 0),
  constraint messages_seq_unique unique (conversation_id, seq)
);

comment on column public.messages.usage is '模型返回的真实 token 用量：{promptTokens, completionTokens, totalTokens}';
comment on column public.messages.status is 'ok 正常结束 / partial 被截断或中止 / error 失败';

-- 读取会话内容：按会话取全部消息并按 seq 排序
create index if not exists messages_conversation_seq_idx
  on public.messages (conversation_id, seq);

-- ------------------------------------------------------------
-- 插入消息时自动推进会话的 last_message_at 与 updated_at
-- 放在数据库层而不是应用层：任何写入路径（含未来的后台任务）
-- 都不会漏掉这两个字段。
-- ------------------------------------------------------------
create or replace function public.touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         updated_at      = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ------------------------------------------------------------
-- RLS：先开启，但**不建任何策略**。
-- 语义是"默认全部拒绝"：只有服务端的 service_role 能读写。
-- 任务 13 再加 owner_id = auth.uid() 的策略，届时策略会自动
-- 叠加在这层默认拒绝之上。
-- ------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- ------------------------------------------------------------
-- 关系删除：删会话时消息级联删除（已在 messages 的外键上声明）
-- 这里额外说明：不要为 messages 单独建 conversation_id 索引的
-- 替代品，复合索引 (conversation_id, seq) 已能服务该查询。
-- ------------------------------------------------------------
