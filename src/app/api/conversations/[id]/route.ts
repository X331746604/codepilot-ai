import { deleteConversation, getConversation, renameConversation } from "@/lib/db/conversations";
import { dbErrorResponse, jsonError, jsonOk } from "@/lib/db/http";
import { idSchema, renameConversationSchema } from "@/lib/db/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveId(context: RouteContext): Promise<string | null> {
  const { id } = await context.params;
  return idSchema.safeParse(id).success ? id : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const id = await resolveId(context);
  if (!id) return jsonError(400, "VALIDATION", "会话 ID 不合法");

  try {
    const row = await getConversation(id);
    if (!row) return jsonError(404, "NOT_FOUND", "会话不存在或已被删除");
    return jsonOk({ conversation: row });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const id = await resolveId(context);
  if (!id) return jsonError(400, "VALIDATION", "会话 ID 不合法");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "请求体必须是合法的 JSON");
  }

  const parsed = renameConversationSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "标题不合法");
  }

  try {
    const row = await renameConversation(id, parsed.data.title);
    if (!row) return jsonError(404, "NOT_FOUND", "会话不存在或已被删除");
    return jsonOk({ conversation: row });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const id = await resolveId(context);
  if (!id) return jsonError(400, "VALIDATION", "会话 ID 不合法");

  try {
    const removed = await deleteConversation(id);
    if (!removed) return jsonError(404, "NOT_FOUND", "会话不存在或已被删除");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
