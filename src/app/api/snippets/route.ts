import { authenticate } from "@/lib/auth/api";
import { decodeCursor, type Cursor } from "@/lib/db/cursor";
import { dbErrorResponse, jsonError, jsonOk } from "@/lib/db/http";
import { createSnippetSchema, listSnippetQuerySchema } from "@/lib/db/schemas";
import { createSnippet, listSnippets } from "@/lib/db/snippets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticate();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = listSnippetQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    language: url.searchParams.get("language") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
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
    const page = await listSnippets(auth.auth.db, { ...parsed.data, cursor });
    return jsonOk({ snippets: page.rows, nextCursor: page.nextCursor });
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

  const parsed = createSnippetSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "参数不合法");
  }

  try {
    const row = await createSnippet(auth.auth.db, parsed.data);
    return jsonOk({ snippet: row }, 201);
  } catch (error) {
    return dbErrorResponse(error);
  }
}
