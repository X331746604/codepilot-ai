import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `设置 · ${APP_NAME}`,
  description: "默认任务类型、默认语言、采样温度与流式输出开关。",
};

export default function SettingsPage() {
  return <SettingsView />;
}
