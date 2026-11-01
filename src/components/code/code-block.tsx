import type { ReactNode } from "react";

import { CopyButton } from "@/components/code/copy-button";
import { getLanguageLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** 把围栏语言标识转成人类可读的标签：typescript → TypeScript，plaintext → TEXT。 */
function formatLanguage(language: string): string {
  if (!language) return "TEXT";
  const known = getLanguageLabel(language);
  if (known !== language) return known;
  if (language === "plaintext" || language === "text") return "TEXT";
  return language.toUpperCase();
}

type CodeBlockProps = {
  code: string;
  language?: string;
  /** 已经高亮好的 <code> 节点；传入时直接渲染，避免二次解析 */
  children?: ReactNode;
  className?: string;
};

export function CodeBlock({ code, language = "", children, className }: CodeBlockProps) {
  return (
    <div className={cn("not-prose my-3 overflow-hidden rounded-lg border bg-muted/30", className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-3 py-1">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {formatLanguage(language)}
        </span>
        <CopyButton text={code} />
      </div>

      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0">
        {children ?? <code className="hljs bg-transparent font-mono">{code}</code>}
      </pre>
    </div>
  );
}
