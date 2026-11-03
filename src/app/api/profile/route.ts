import { authenticate } from "@/lib/auth/api";
import { dbErrorResponse, jsonError, jsonOk } from "@/lib/db/http";
import { getProfile, updateDefaultLanguage } from "@/lib/db/profiles";
import { updateProfileSchema } from "@/lib/db/schemas";
import type { ProfileView } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toView(profile: {
  email: string;
  default_language: string;
  created_at: string;
}): ProfileView {
  return {
    // 以 auth.users 的邮箱为准：profiles.email 只是注册时的快照
    email: profile.email,
    defaultLanguage: profile.default_language,
    createdAt: profile.created_at,
  };
}

export async function GET() {
  const auth = await authenticate();
  if (!auth.ok) return auth.response;

  try {
    const profile = await getProfile(auth.auth.db, auth.auth.userId);
    if (!profile) return jsonError(404, "NOT_FOUND", "资料不存在");

    return jsonOk({
      profile: toView({ ...profile, email: auth.auth.email || profile.email }),
    });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticate();
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "请求体必须是合法的 JSON");
  }

  const parsed = updateProfileSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "参数不合法");
  }

  try {
    const profile = await updateDefaultLanguage(
      auth.auth.db,
      auth.auth.userId,
      parsed.data.defaultLanguage,
    );
    if (!profile) return jsonError(404, "NOT_FOUND", "资料不存在");

    return jsonOk({ profile: toView({ ...profile, email: auth.auth.email || profile.email }) });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
