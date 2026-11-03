import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — AI 编程工作台`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: ["AI 编程", "代码生成", "代码解释", "错误分析", "代码重构", "Next.js"],
  authors: [{ name: APP_NAME }],
  openGraph: {
    title: `${APP_NAME} — AI 编程工作台`,
    description: APP_DESCRIPTION,
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

/**
 * CSP 的 nonce 必须在渲染期从请求头里取，而静态生成的页面拿不到请求头。
 * 本项目的页面全部依赖会话态，本来也静态不了，因此整站显式走动态渲染。
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // proxy 在每个 HTML 请求上生成 nonce；next-themes 会注入一段内联脚本
  // 用来在 hydration 前设置主题，它拿不到 Next 自动附加的 nonce，需要手动传。
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="zh-CN"
      // 主题由 next-themes 在客户端写入 class，服务端渲染出的 class 与之必然不同，
      // 因此显式关闭该层级的 hydration 校验，避免控制台报错。
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
