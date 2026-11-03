-- ============================================================
-- CodePilot AI — 认证与行级安全
-- 用法：Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 幂等：可重复执行
--
-- 前置：Authentication → Providers → Email 已启用。
-- 注意：项目默认开启「Confirm email」，真实注册需要点邮件里的链接；
-- 本地验证用 Admin API 直接建「已确认」的账号（见 docs/auth.md）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles：与 auth.users 一一对应的公开资料
-- 只放展示与偏好字段，密码哈希之类永远留在 auth schema。
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null default '',
  default_language text not null default 'typescript',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint profiles_language check (
    default_language in ('typescript', 'javascript', 'python', 'java', 'go', 'sql', 'html-css', 'other')
  )
);

comment on table public.profiles is '用户公开资料与业务偏好；主键即 auth.users.id';

alter table public.profiles enable row level security;

-- 只读自己的；写只允许改自己那行，且不能改 id
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- 刻意不建 insert / delete 策略：
-- 建档由下面的触发器（security definer）完成，删号随 auth.users 级联。
-- 客户端拿不到 insert 权限，也就无法伪造别人的 profile。

-- ------------------------------------------------------------
-- 2. 注册时自动建档
-- security definer 是必须的：触发器在 auth schema 的插入过程中执行，
-- 而调用者（anon）对 public.profiles 没有 insert 权限。
-- 同时固定 search_path，避免被恶意 schema 劫持。
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 3. 三张业务表补 owner_id
--
-- 接入认证前写入的数据 owner_id 为空，无法归属到任何账号。
-- 它们是开发期的测试数据，这里直接删除——保留下来只会变成
-- 谁都读不到、也删不掉的"幽灵行"。
-- ------------------------------------------------------------
delete from public.conversations where owner_id is null;  -- messages 级联删除
delete from public.snippets      where owner_id is null;

alter table public.conversations alter column owner_id set default auth.uid();
alter table public.messages      alter column owner_id set default auth.uid();
alter table public.snippets      alter column owner_id set default auth.uid();

alter table public.conversations alter column owner_id set not null;
alter table public.messages      alter column owner_id set not null;
alter table public.snippets      alter column owner_id set not null;

-- ------------------------------------------------------------
-- 4. RLS 策略：四类操作全部限定 owner_id = auth.uid()
--
-- 之前的表是"开了 RLS 但没有策略" = 全部拒绝。现在在其上叠加允许规则。
-- ------------------------------------------------------------

-- conversations
drop policy if exists conversations_select_own on public.conversations;
create policy conversations_select_own on public.conversations
  for select using (owner_id = auth.uid());

drop policy if exists conversations_insert_own on public.conversations;
create policy conversations_insert_own on public.conversations
  for insert with check (owner_id = auth.uid());

drop policy if exists conversations_update_own on public.conversations;
create policy conversations_update_own on public.conversations
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists conversations_delete_own on public.conversations;
create policy conversations_delete_own on public.conversations
  for delete using (owner_id = auth.uid());

-- snippets
drop policy if exists snippets_select_own on public.snippets;
create policy snippets_select_own on public.snippets
  for select using (owner_id = auth.uid());

drop policy if exists snippets_insert_own on public.snippets;
create policy snippets_insert_own on public.snippets
  for insert with check (owner_id = auth.uid());

drop policy if exists snippets_update_own on public.snippets;
create policy snippets_update_own on public.snippets
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists snippets_delete_own on public.snippets;
create policy snippets_delete_own on public.snippets
  for delete using (owner_id = auth.uid());

-- messages
drop policy if exists messages_select_own on public.messages;
create policy messages_select_own on public.messages
  for select using (owner_id = auth.uid());

-- 仅校验 owner_id 是不够的：owner_id 取默认值 auth.uid() 时，
-- 用户可以把自己的消息挂到**别人的会话**下（外键只保证会话存在）。
-- 因此 insert 还要证明父会话属于自己。
drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages
  for insert with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and c.owner_id = auth.uid()
    )
  );

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages
  for delete using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- 5. 索引：查询都带 owner_id 过滤，把 owner 放最左列
-- ------------------------------------------------------------
create index if not exists conversations_owner_cursor_idx
  on public.conversations (owner_id, last_message_at desc, id desc);

create index if not exists messages_owner_idx
  on public.messages (owner_id, conversation_id);

create index if not exists snippets_owner_cursor_idx
  on public.snippets (owner_id, created_at desc, id desc);
