import { Brand } from "@/components/layout/brand";
import { APP_NAME } from "@/lib/constants";

const STACK = [
  "Next.js 16",
  "React 19",
  "TypeScript",
  "Tailwind CSS 4",
  "shadcn/ui",
  "Supabase",
  "Vercel",
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <Brand />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              个人项目，用于完整走一遍 AI 应用开发链路：需求、建模、接口、模型接入、测试与部署。
              页面只展示当前真实可用的能力，未完成的部分会明确标注。
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">技术栈</p>
            <ul className="mt-2 flex max-w-xs flex-wrap gap-1.5">
              {STACK.map((item) => (
                <li
                  key={item}
                  className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 border-t pt-6 text-xs text-muted-foreground">
          © 2026 {APP_NAME} · 当前进度：界面与工程骨架已完成，模型接入与数据持久化进行中
        </p>
      </div>
    </footer>
  );
}
