import type { Metadata } from "next";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export const metadata: Metadata = {
  title: "工作台",
  description: "输入需求或粘贴代码，在工作台里完成生成、解释、调试与重构。",
};

export default function WorkspacePage() {
  return <WorkspaceShell />;
}
