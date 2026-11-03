import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 默认阻止跨来源访问 dev 资源（/_next/hmr）。开发时用 127.0.0.1
  // 而不是 localhost 打开页面会被判定为跨来源，表现为"页面正常但完全不响应交互"，
  // 且控制台没有报错——极难排查。这里显式放行本地两个来源。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Tailwind CSS v4 由 Turbopack loader 处理，无需 postcss.config。
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // 说明：脚手架默认开启 cacheComponents（Next 16 的 Cache Components）。
  // 本项目大量页面依赖请求期的会话态与数据库读取，该模式会强制为动态数据包裹
  // Suspense 边界，初期会增加不必要的构建失败面，故显式关闭，后续按需再评估。
  cacheComponents: false,
  // 开发模式的悬浮指示器会压在侧栏底部的「代码片段」入口上，截图与录屏时很碍事。
  // 只在 dev 生效，生产构建本来就没有它。
  devIndicators: false,

  /**
   * 安全响应头。CSP 不在这里配——它需要每个请求一个 nonce，只能放在 proxy 里；
   * 两处都设置会互相覆盖，nonce 版本会被这段静态值盖掉。
   */
  async headers() {
    const base = [
      // 禁止浏览器猜 MIME，避免把上传/返回的内容当脚本执行
      { key: "X-Content-Type-Options", value: "nosniff" },
      // 跨站请求不带完整路径，避免把会话相关 URL 泄露给第三方
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // 与 CSP 的 frame-ancestors 重复，但老浏览器不认后者
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];

    // HSTS 只在生产下发：本地是 http，下发既无意义，也可能把 localhost 钉死
    if (process.env.NODE_ENV === "production") {
      base.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/:path*", headers: base }];
  },
};

export default nextConfig;
