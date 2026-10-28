import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Brand />

        <nav aria-label="主导航" className="ml-6 hidden items-center gap-1 text-sm sm:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/workspace">工作台</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/#capabilities">功能</Link>
          </Button>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button asChild size="sm" className="ml-1">
            <Link href="/workspace">
              开始使用
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
