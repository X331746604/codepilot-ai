import { getConversation, listMessages } from "@/lib/db/conversations";
import { dbErrorResponse, jsonError, jsonOk } from "@/lib/db/http";
import { idSchema } from "@/lib/db/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** 一次性返回会话与其全部消息：打开会话时只需要一次往返。 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return jsonError(400, "VALIDATION", "会话 ID 不合法");
  }

  try {
    const conversation = await getConversation(id);
    if (!conversation) return jsonError(404, "NOT_FOUND", "会话不存在或已被删除");

    const messages = await listMessages(id);
    return jsonOk({ conversation, messages });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
