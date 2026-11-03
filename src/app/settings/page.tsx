import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";
import { requireSessionWithProfile } from "@/lib/auth/session-profile";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `设置 · ${APP_NAME}`,
  description: "默认任务类型、采样温度、流式输出开关与账号信息。",
};

export default async function SettingsPage() {
  const profile = await requireSessionWithProfile("/settings");

  return (
    <SettingsView
      email={profile.email}
      createdAt={profile.createdAt}
      defaultLanguage={profile.defaultLanguage}
    />
  );
}
