import { createConversation, listConversations } from "@/lib/db/conversations";
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
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError(400, "VALIDATION", "limit 必须是 1–50 之间的整数");
  }

  try {
    const rows = await listConversations(parsed.data.limit);
    return jsonOk({ conversations: rows.map(toSummary) });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function POST(request: Request) {
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
    const row = await createConversation(parsed.data);
    return jsonOk({ conversation: toSummary(row) }, 201);
  } catch (error) {
    return dbErrorResponse(error);
  }
}
