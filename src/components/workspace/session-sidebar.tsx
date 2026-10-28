import { MessageSquare, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SessionSidebar() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="p-3">
        <Tooltip>
          {/* disabled 的按钮不触发指针事件，用 span 承载提示 */}
          <TooltipTrigger asChild>
            <span tabIndex={0} className="block">
              <Button variant="outline" className="w-full justify-start gap-2" disabled>
                <Plus data-icon="inline-start" />
                新建会话
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">会话管理将在接入数据库后开放</TooltipContent>
        </Tooltip>
      </div>

      <Separator />

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto px-6 py-8 text-center">
        <MessageSquare className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">还没有会话</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          会话需要数据库支持，接入后会在这里按时间排列。
        </p>
      </div>

      <Separator />

      <div className="shrink-0 p-3">
        <p className="text-xs text-muted-foreground">单用户模式 · 尚未做用户隔离</p>
      </div>
    </div>
  );
}
