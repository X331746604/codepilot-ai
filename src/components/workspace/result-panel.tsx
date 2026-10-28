import { FileCode } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function ResultPanel() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-sm font-medium">结果</span>
        <Badge variant="outline" className="ml-auto text-[10px]">
          空
        </Badge>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <FileCode className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">还没有结果</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          任务提交后，代码与说明会分区显示在这里，支持复制、重新生成与前后对比。
        </p>
      </div>
    </div>
  );
}
