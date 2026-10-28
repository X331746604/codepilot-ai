import { readAiConfig } from "@/lib/env";

export const runtime = "nodejs";

/**
 * 部署自检：只回答"配置是否就绪"，不返回任何密钥片段或 URL 细节。
 */
export async function GET() {
  const result = readAiConfig();

  return Response.json(
    {
      status: "ok",
      ai: result.ok
        ? { configured: true, model: result.config.model }
        : { configured: false, missing: result.missing },
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
