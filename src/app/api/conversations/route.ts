import { authenticate } from "@/lib/auth/api";
import { rangeToSince } from "@/lib/constants";
import { createConversation, listConversations } from "@/lib/db/conversations";
import { decodeCursor, type Cursor } from "@/lib/db/cursor";
import { dbErrorResponse, jsonError, jsonOk } from "@/lib/db/http";
import { createConversationSchema, listQuerySchema } from "@/lib/db/schemas";
import type { ConversationRow, ConversationSummary } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    task_type: row.task_type,
    language: row.language,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
  };
}

export async function GET(request: Request) {
  const auth = await authenticate();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    range: url.searchParams.get("range") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "查询参数不合法");
  }

  let cursor: Cursor | null = null;
  if (parsed.data.cursor) {
    cursor = decodeCursor(parsed.data.cursor);
    if (!cursor) {
      return jsonError(400, "VALIDATION", "分页游标不合法");
    }
  }

  try {
    const page = await listConversations(auth.auth.db, {
      limit: parsed.data.limit,
      cursor,
      keyword: parsed.data.q,
      since: rangeToSince(parsed.data.range),
    });

    return jsonOk({
      conversations: page.rows.map(toSummary),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await authenticate();
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "请求体必须是合法的 JSON");
  }

  const parsed = createConversationSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "参数不合法");
  }

  try {
    const row = await createConversation(auth.auth.db, parsed.data);
    return jsonOk({ conversation: toSummary(row) }, 201);
  } catch (error) {
    return dbErrorResponse(error);
  }
}
