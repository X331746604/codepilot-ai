import { readAiConfig, readSupabasePublicConfig } from "@/lib/env";

export const runtime = "nodejs";

/**
 * 部署自检：只回答"配置是否就绪"，不返回任何密钥片段或 URL 细节。
 *
 * 刻意不在这里查数据库：探针会被高频调用，每次多一次跨洋查询不划算。
 * 这里只证明变量到位，真实的读写由部署后的手工验收覆盖。
 */
export async function GET() {
  const result = readAiConfig();
  const database = readSupabasePublicConfig();

  return Response.json(
    {
      status: "ok",
      ai: result.ok
        ? { configured: true, model: result.config.model }
        : { configured: false, missing: result.missing },
      database: { configured: Boolean(database) },
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
