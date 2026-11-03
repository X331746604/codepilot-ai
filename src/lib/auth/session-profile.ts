/**
 * 页面级会话 + 资料。
 *
 * 三个受保护的页面（工作台 / 片段 / 设置）都需要"当前用户 + 默认语言"，
 * 收在一处，避免每个页面各写一遍 fallback 逻辑。
 */

import { DEFAULT_LANGUAGE, type Language } from "@/lib/constants";
import { getProfile } from "@/lib/db/profiles";

import { requireSession } from "./guard";

export type SessionProfile = {
  userId: string;
  email: string;
  defaultLanguage: Language;
  createdAt: string;
};

function asLanguage(value: string | undefined): Language {
  // profiles.default_language 有 check 约束，理论上不会出现未知值；
  // 但约束是后加的，老数据仍可能为空，这里兜一层。
  return (value ?? DEFAULT_LANGUAGE) as Language;
}

export async function requireSessionWithProfile(nextPath: string): Promise<SessionProfile> {
  const session = await requireSession(nextPath);
  const profile = await getProfile(session.supabase, session.user.id);

  return {
    userId: session.user.id,
    email: session.user.email ?? profile?.email ?? "",
    defaultLanguage: asLanguage(profile?.default_language),
    createdAt: profile?.created_at ?? session.user.created_at ?? "",
  };
}
