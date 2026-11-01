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
};

export default nextConfig;
