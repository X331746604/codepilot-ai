import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并 Tailwind 类名：先用 clsx 处理条件类名，再用 tailwind-merge 消解冲突
 * （后出现的类名优先，例如 `px-2` 与 `px-4` 同时存在时保留 `px-4`）。
 *
 * shadcn/ui 的所有组件都依赖这个函数，因此它是 UI 层唯一的样式拼装入口。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
