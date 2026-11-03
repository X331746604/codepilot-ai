/**
 * 在 PGlite（WASM 版 Postgres）里跑一遍全部迁移，并验证 RLS 行为。
 *
 * 为什么需要它：迁移是在 Supabase SQL Editor 手工执行的，写错一个列名要等
 * 贴上去才知道（0004 第一版就在 messages 上引用了不存在的 owner_id）。
 * 这个脚本把「语法能否通过」和「策略是否真的隔离」提前到本地。
 *
 * 它不能替代线上验证：Supabase 的 auth schema、默认权限、扩展版本都更完整，
 * 这里只搭了最小等价物。真实数据读写仍要用 scripts/verify-supabase.mjs。
 *
 * 用法：node scripts/verify-migrations.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(join(root, "supabase/migrations", name), "utf8");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const db = new PGlite({ extensions: { pg_trgm } });

/** 模拟 Supabase 的 auth schema：一个用户表 + auth.uid() */
async function bootstrapAuth() {
  await db.exec(`
    create schema if not exists auth;
    -- Supabase 建库时自带 extensions schema，0003 会把 pg_trgm 装到那里
    create schema if not exists extensions;
    create table auth.users (
      id    uuid primary key,
      email text
    );

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;

    create role authenticated;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
}

/** 以某个用户身份执行；null 表示数据库管理员（绕过 RLS） */
async function asUser(id, fn) {
  await db.exec("reset role");
  if (id) {
    await db.exec(`set request.jwt.claim.sub = '${id}'`);
    await db.exec("set role authenticated");
  }
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function main() {
  await bootstrapAuth();

  // 触发器生效前就存在的账号：用来验证迁移末尾的回填
  await db.exec(`insert into auth.users (id, email) values ('${USER_A}', 'a@example.com')`);

  for (const file of ["0001_init.sql", "0002_snippets.sql", "0003_search_indexes.sql"]) {
    await db.exec(read(file));
    console.log(`OK    执行 ${file}`);
  }

  // 接入认证前的匿名数据，迁移应当把它们清掉
  await db.exec(`
    insert into public.conversations (title, task_type, language)
    values ('匿名会话', 'generate', 'typescript');

    insert into public.messages (conversation_id, seq, role, content, task_type, language)
    select id, 1, 'user', '匿名消息', 'generate', 'typescript' from public.conversations;

    insert into public.snippets (title, language, code)
    values ('匿名片段', 'typescript', 'const a = 1');
  `);

  await db.exec(read("0004_auth.sql"));
  console.log("OK    执行 0004_auth.sql");

  // Supabase 对 public schema 有默认权限，新建的 profiles 自动对 authenticated 开放；
  // PGlite 没有这层默认值，需要在这里补一次（RLS 仍然生效，权限只是让语句能走到策略判断）。
  await db.exec(`
    grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated;
  `);

  // 触发器生效后注册的账号
  await db.exec(`insert into auth.users (id, email) values ('${USER_B}', 'b@example.com')`);

  // ---- 结构与回填 ----
  const cols = await db.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'messages'`,
  );
  check(
    "messages 没有 owner_id 列",
    !cols.rows.some((row) => row.column_name === "owner_id"),
  );

  const profiles = await db.query("select id, email from public.profiles order by email");
  check("已有账号被回填 profile", profiles.rows.length === 2, JSON.stringify(profiles.rows));
  check("新注册账号由触发器建档", profiles.rows.some((r) => r.id === USER_B));

  const legacy = await db.query("select count(*)::int as n from public.conversations");
  check("匿名会话被清理", legacy.rows[0].n === 0, `剩余 ${legacy.rows[0].n}`);
  const legacySnippets = await db.query("select count(*)::int as n from public.snippets");
  check("匿名片段被清理", legacySnippets.rows[0].n === 0, `剩余 ${legacySnippets.rows[0].n}`);

  // ---- A 正常读写 ----
  const created = await asUser(USER_A, async () => {
    const row = await db.query(
      `insert into public.conversations (title, task_type, language)
       values ('A 的会话', 'generate', 'typescript')
       returning id, owner_id`,
    );
    const conversationId = row.rows[0].id;
    await db.query(
      `insert into public.messages (conversation_id, seq, role, content, task_type, language)
       values ($1, 1, 'user', 'A 的消息', 'generate', 'typescript')`,
      [conversationId],
    );
    await db.query(
      `insert into public.snippets (title, language, code)
       values ('A 的片段', 'typescript', 'const a = 1')`,
    );
    return { conversationId, ownerId: row.rows[0].owner_id };
  });
  check("A 建会话时 owner_id 自动取 auth.uid()", created.ownerId === USER_A, String(created.ownerId));

  const aSees = await asUser(USER_A, async () => {
    const conversations = await db.query("select id from public.conversations");
    const messages = await db.query("select id from public.messages");
    const snippets = await db.query("select id from public.snippets");
    return {
      conversations: conversations.rows.length,
      messages: messages.rows.length,
      snippets: snippets.rows.length,
    };
  });
  check(
    "A 能看到自己的三类数据",
    aSees.conversations === 1 && aSees.messages === 1 && aSees.snippets === 1,
    JSON.stringify(aSees),
  );

  // ---- B 看不到也改不动 ----
  const bSees = await asUser(USER_B, async () => {
    const conversations = await db.query("select id from public.conversations");
    const messages = await db.query("select id from public.messages");
    const snippets = await db.query("select id from public.snippets");
    return {
      conversations: conversations.rows.length,
      messages: messages.rows.length,
      snippets: snippets.rows.length,
    };
  });
  check(
    "B 读不到 A 的会话 / 消息 / 片段",
    bSees.conversations === 0 && bSees.messages === 0 && bSees.snippets === 0,
    JSON.stringify(bSees),
  );

  const bUpdate = await asUser(USER_B, () =>
    db.query("update public.conversations set title = '被改了' where id = $1 returning id", [
      created.conversationId,
    ]),
  );
  check("B 改不动 A 的会话", bUpdate.rows.length === 0);

  const bDelete = await asUser(USER_B, () =>
    db.query("delete from public.messages where conversation_id = $1 returning id", [
      created.conversationId,
    ]),
  );
  check("B 删不掉 A 的消息", bDelete.rows.length === 0);

  let bInsertDenied = false;
  let bInsertCode = "";
  try {
    await asUser(USER_B, () =>
      db.query(
        `insert into public.messages (conversation_id, seq, role, content, task_type, language)
         values ($1, 2, 'user', '插到别人会话下', 'generate', 'typescript')`,
        [created.conversationId],
      ),
    );
  } catch (error) {
    bInsertDenied = true;
    bInsertCode = error.code ?? "";
  }
  check("B 无法把消息插进 A 的会话", bInsertDenied, bInsertCode);

  // ---- B 自己的数据互不干扰 ----
  const bOwn = await asUser(USER_B, async () => {
    const row = await db.query(
      `insert into public.conversations (title, task_type, language)
       values ('B 的会话', 'explain', 'python')
       returning id`,
    );
    await db.query(
      `insert into public.messages (conversation_id, seq, role, content, task_type, language)
       values ($1, 1, 'user', 'B 的消息', 'explain', 'python')`,
      [row.rows[0].id],
    );
    const conversations = await db.query("select id from public.conversations");
    const messages = await db.query("select id from public.messages");
    return { conversations: conversations.rows.length, messages: messages.rows.length };
  });
  check(
    "B 只能看到自己的新数据",
    bOwn.conversations === 1 && bOwn.messages === 1,
    JSON.stringify(bOwn),
  );

  // ---- 资料隔离 ----
  const bProfiles = await asUser(USER_B, () => db.query("select id from public.profiles"));
  check("B 只能读到自己的 profile", bProfiles.rows.length === 1 && bProfiles.rows[0].id === USER_B);

  const bProfileUpdate = await asUser(USER_B, () =>
    db.query(
      `update public.profiles set default_language = 'java'
        where id = $1 returning id`,
      [USER_A],
    ),
  );
  check("B 改不动 A 的 profile", bProfileUpdate.rows.length === 0);

  // ---- 删账号级联 ----
  await db.exec(`delete from auth.users where id = '${USER_A}'`);
  const afterDelete = await db.query(
    `select
       (select count(*)::int from public.conversations where owner_id = '${USER_A}') as conversations,
       (select count(*)::int from public.messages) as messages`,
  );
  check(
    "删账号后会话与消息一并消失",
    afterDelete.rows[0].conversations === 0 && afterDelete.rows[0].messages === 1,
    JSON.stringify(afterDelete.rows[0]),
  );

  await db.close();

  console.log(`\n${passed} 项通过，${failures.length} 项失败`);
  if (failures.length > 0) {
    console.log(`失败项：${failures.join("、")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("迁移验证中断：", error.message);
  if (error.position) console.error("位置：", error.position);
  process.exit(1);
});
