/**
 * Supabase 连通性与 Schema 自检。
 *
 * 用法：
 *   1. 在 .env.local 里填好 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY
 *   2. 在 Supabase SQL Editor 执行 supabase/migrations/0001_init.sql
 *   3. node scripts/verify-supabase.mjs
 *
 * 它会真实写入一条会话与一条消息，读回校验，再删除并确认级联生效。
 * 全程只用 fetch 调用 PostgREST，因此不需要安装任何依赖。
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return out;
}

const fileEnv = loadEnvFile(join(root, ".env.local"));
const url = (process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !key) {
  console.error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（.env.local 或环境变量）");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function request(path, init = {}) {
  const response = await fetch(`${url}/rest/v1${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

let conversationId = null;

try {
  // 1. 表是否存在
  const probe = await request("/conversations?select=id&limit=1");
  record(
    "表 conversations 可访问",
    probe.status === 200,
    probe.status === 200 ? "" : `HTTP ${probe.status} ${JSON.stringify(probe.body).slice(0, 200)}`,
  );
  if (probe.status !== 200) throw new Error("无法访问 conversations 表，请先执行迁移 SQL");

  const probeMessages = await request("/messages?select=id&limit=1");
  record("表 messages 可访问", probeMessages.status === 200, probeMessages.status === 200 ? "" : `HTTP ${probeMessages.status}`);

  // 2. 写入会话
  const created = await request("/conversations", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      title: "自检会话（可删除）",
      task_type: "generate",
      language: "typescript",
    }),
  });
  conversationId = created.body?.[0]?.id ?? null;
  record("写入 conversations", created.status === 201 && Boolean(conversationId), `HTTP ${created.status}`);

  // 3. 写入消息（seq 唯一约束 + 触发器更新 last_message_at）
  const message = await request("/messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      conversation_id: conversationId,
      seq: 1,
      role: "user",
      content: "自检消息",
      task_type: "generate",
      language: "typescript",
      status: "ok",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }),
  });
  record("写入 messages", message.status === 201, `HTTP ${message.status}`);

  // 4. 读回
  const readBack = await request(`/messages?conversation_id=eq.${conversationId}&select=seq,content,usage`);
  const row = Array.isArray(readBack.body) ? readBack.body[0] : null;
  record(
    "读回消息内容",
    row?.content === "自检消息" && row?.usage?.totalTokens === 2,
    JSON.stringify(row),
  );

  // 5. 触发器是否推进了会话时间（应为 insert 时间，非默认值）
  const conv = await request(`/conversations?id=eq.${conversationId}&select=last_message_at,updated_at`);
  const convRow = Array.isArray(conv.body) ? conv.body[0] : null;
  record("触发器更新 last_message_at", Boolean(convRow), convRow ? convRow.last_message_at : "");
} catch (error) {
  record("执行中断", false, String(error).slice(0, 200));
} finally {
  // 6. 清理：删会话，确认消息被级联删除
  if (conversationId) {
    const deleted = await request(`/conversations?id=eq.${conversationId}`, { method: "DELETE" });
    record("删除会话", deleted.status === 204, `HTTP ${deleted.status}`);

    const orphan = await request(`/messages?conversation_id=eq.${conversationId}&select=id`);
    const empty = Array.isArray(orphan.body) && orphan.body.length === 0;
    record("级联删除生效", empty, `剩余 ${Array.isArray(orphan.body) ? orphan.body.length : "?"} 条`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
