import { authenticate } from "@/lib/auth/api";
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

/**
 * 越权访问返回 404 而不是 403：
 * 403 等于告诉对方"这个 ID 存在但不是你的"，本身就是信息泄露。
 * RLS 让查询直接查不到别人的行，自然落到"不存在"这一支。
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if (!auth.ok) return auth.response;

  const id = await resolveId(context);
  if (!id) return jsonError(400, "VALIDATION", "会话 ID 不合法");

  try {
    const row = await getConversation(auth.auth.db, id);
    if (!row) return jsonError(404, "NOT_FOUND", "会话不存在或已被删除");
    return jsonOk({ conversation: row });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if (!auth.ok) return auth.response;

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
    const row = await renameConversation(auth.auth.db, id, parsed.data.title);
    if (!row) return jsonError(404, "NOT_FOUND", "会话不存在或已被删除");
    return jsonOk({ conversation: row });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if (!auth.ok) return auth.response;

  const id = await resolveId(context);
  if (!id) return jsonError(400, "VALIDATION", "会话 ID 不合法");

  try {
    const removed = await deleteConversation(auth.auth.db, id);
    if (!removed) return jsonError(404, "NOT_FOUND", "会话不存在或已被删除");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
