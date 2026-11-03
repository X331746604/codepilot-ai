import type { Metadata } from "next";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireSessionWithProfile } from "@/lib/auth/session-profile";

export const metadata: Metadata = {
  title: "工作台",
  description: "输入需求或粘贴代码，在工作台里完成生成、解释、调试与重构。",
};

export default async function WorkspacePage() {
  // 默认语言来自 profiles，不是 localStorage：换台电脑也应该还在
  const profile = await requireSessionWithProfile("/workspace");

  return <WorkspaceShell userEmail={profile.email} defaultLanguage={profile.defaultLanguage} />;
}
