-- ============================================================
-- CodePilot AI — 搜索与分页索引
-- 用法：Supabase 控制台 → SQL Editor → 粘贴全文 → Run
-- 幂等：可重复执行
--
-- 这一份只影响性能，不影响正确性：不加索引，下面的查询照样返回
-- 相同结果，只是数据量上来后会退化成全表扫描。因此它可以晚于
-- 代码上线执行，不会造成功能不可用。
-- ============================================================

-- ------------------------------------------------------------
-- pg_trgm：让 `ilike '%关键词%'` 能走 GIN 索引。
-- 默认的 B-tree 对前置通配符完全无效，必须用三元组索引。
-- ------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- 扩展可能被装在 extensions 或 public，两者都放进 search_path，
-- 这样下面写 opclass 时不必硬编码 schema。
set search_path to public, extensions;

-- ------------------------------------------------------------
-- 会话
-- ------------------------------------------------------------

-- 侧栏标题搜索：title ilike '%词%'
create index if not exists conversations_title_trgm_idx
  on public.conversations using gin (title gin_trgm_ops);

-- 游标分页：与 order by last_message_at desc, id desc 完全对齐。
-- 列的先后顺序必须和排序一一对应，反过来（id 在前）就用不上了。
create index if not exists conversations_cursor_idx
  on public.conversations (last_message_at desc, id desc);

-- ------------------------------------------------------------
-- 代码片段
-- ------------------------------------------------------------

-- 片段列表按 created_at 倒序翻页
create index if not exists snippets_cursor_idx
  on public.snippets (created_at desc, id desc);

-- 片段搜索同时匹配标题与代码正文
create index if not exists snippets_title_trgm_idx
  on public.snippets using gin (title gin_trgm_ops);

-- 代码正文最长 20000 字，三元组索引体积会明显大于标题索引。
-- 这是"搜索代码内容"这个功能的必要成本；如果你更在意存储，
-- 可以删掉这条，代码搜索会退化为顺序扫描（少量数据下仍可用）。
create index if not exists snippets_code_trgm_idx
  on public.snippets using gin (code gin_trgm_ops);
