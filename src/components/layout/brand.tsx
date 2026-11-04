import Link from "next/link";
import { CodeXml } from "lucide-react";

import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <CodeXml className="size-4" />
      </span>
      <span className="text-sm font-semibold tracking-tight whitespace-nowrap">{APP_NAME}</span>
    </Link>
  );
}
