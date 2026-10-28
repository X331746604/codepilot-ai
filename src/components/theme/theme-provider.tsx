"use client";

import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * 主题上下文。next-themes 会把结果写到 <html class="dark"> 上，
 * 配合 globals.css 里的 `.dark` 变量组完成整站换肤，避免逐组件传状态。
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
