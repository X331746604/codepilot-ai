import type { Metadata } from "next";

import { SnippetsView } from "@/components/snippets/snippets-view";
import { requireSessionWithProfile } from "@/lib/auth/session-profile";

export const metadata: Metadata = {
  title: "代码片段",
  description: "保存、检索与复用 AI 生成的代码片段。",
};

export default async function SnippetsPage() {
  const profile = await requireSessionWithProfile("/snippets");

  return <SnippetsView userEmail={profile.email} defaultLanguage={profile.defaultLanguage} />;
}
