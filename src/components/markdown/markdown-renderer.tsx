"use client";

import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/components/code/code-block";
import { cn } from "@/lib/utils";

/** 高亮后的节点是嵌套的 span，复制时要把它还原成纯文本。 */
function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeToText(node.props.children);
  return "";
}

const components: Components = {
  // 默认的 <pre> 没有语言标识与复制按钮，这里整体换成 CodeBlock
  pre({ children }) {
    const child = Children.toArray(children)[0];
    const props = isValidElement<{ className?: string; children?: ReactNode }>(child)
      ? child.props
      : null;
    const language = /language-([\w-]+)/.exec(props?.className ?? "")?.[1] ?? "";
    const code = nodeToText(props?.children ?? children).replace(/\n$/, "");

    return (
      <CodeBlock code={code} language={language}>
        {isValidElement(child) ? child : null}
      </CodeBlock>
    );
  },

  // 行内代码
  code({ className, children, ...rest }) {
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) {
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] font-normal" {...rest}>
        {children}
      </code>
    );
  },

  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
        {children}
      </a>
    );
  },
};

export function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-foreground",
        "prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-headings:text-foreground",
        "prose-p:my-2 prose-p:leading-relaxed",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
        "prose-strong:text-foreground prose-code:text-foreground",
        "prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0",
        "prose-blockquote:border-l-2 prose-blockquote:font-normal prose-blockquote:text-muted-foreground",
        "prose-table:text-sm prose-th:text-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // detect:false 表示不猜测语言，避免把普通文本误判成代码而变慢；
        // ignoreMissing 表示遇到未知语言标识时跳过高亮而不是报错。
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
