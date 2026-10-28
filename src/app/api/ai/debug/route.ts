import { createAiRoute } from "@/lib/ai/handler";

// 流式响应需要长连接，Node 运行时下才能稳定拿到 ReadableStream。
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = createAiRoute("debug");
