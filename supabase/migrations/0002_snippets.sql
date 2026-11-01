-- ============================================================
-- CodePilot AI — 代码片段表
-- 用法：Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 幂等：可重复执行
-- ============================================================

create table if not exists public.snippets (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid null,
  title             text not null,
  language          text not null,
  code              text not null,
  description       text null,
  -- 来源消息被删除时置空，片段本身保留：用户保存过的资产不应该因为清理会话而消失
  source_message_id uuid null references public.messages (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint snippets_title_len check (char_length(title) between 1 and 100),
  constraint snippets_desc_len  check (description is null or char_length(description) <= 500),
  constraint snippets_code_len  check (char_length(code) between 1 and 20000)
);

comment on table public.snippets is '用户显式保存的代码片段，独立于会话长期留存';
comment on column public.snippets.source_message_id is '从哪条回答保存而来；消息删除后置空，片段保留';

-- 列表默认按创建时间倒序
create index if not exists snippets_recent_idx
  on public.snippets (owner_id, created_at desc);

-- 按语言筛选
create index if not exists snippets_language_idx
  on public.snippets (owner_id, language);

-- RLS：与 conversations 保持一致，先开启、不建策略 = 默认全部拒绝
alter table public.snippets enable row level security;
