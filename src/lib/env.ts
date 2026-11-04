/**
 * 服务端环境变量的读取与校验。
 *
 * 只在这里读 process.env，其它模块一律接收配置对象，
 * 这样可以保证"缺 Key"这类问题只在一个地方暴露，也便于测试时注入假配置。
 */

export const DEFAULT_AI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_AI_MODEL = "qwen-plus";

export type AiRuntimeConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
};

export type AiConfigResult =
  | { ok: true; config: AiRuntimeConfig }
  | { ok: false; missing: string[] };

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readAiConfig(): AiConfigResult {
  const apiKey = process.env.AI_API_KEY?.trim() ?? "";
  const baseUrl = (process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL).replace(/\/+$/, "");
  const model = process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;

  const missing: string[] = [];
  if (!apiKey) missing.push("AI_API_KEY");
  if (!/^https?:\/\//.test(baseUrl)) missing.push("AI_BASE_URL");
  if (!model) missing.push("AI_MODEL");

  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      baseUrl,
      apiKey,
      model,
      timeoutMs: readInt(process.env.AI_TIMEOUT_MS, 60_000),
      rateLimitPerMinute: readInt(process.env.AI_RATE_LIMIT_PER_MINUTE, 10),
      rateLimitPerHour: readInt(process.env.AI_RATE_LIMIT_PER_HOUR, 60),
    },
  };
}

export type SupabasePublicConfig = { url: string; publishableKey: string };

/**
 * 浏览器与用户态客户端使用的配置。
 *
 * 这两个值是公开的：publishable key 只能做 RLS 允许的事，暴露它不等于交出数据库。
 *
 * 注意这里**没有**读取 secret key 的入口。任务 13 之后，请求路径一律使用
 * 「publishable key + 用户 token」，secret key 只剩脚本（建表、建测试账号）在用，
 * 因此部署到 Vercel 时不需要配置它——生产环境少一把能绕过 RLS 的钥匙。
 */
export function readSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    ""
  ).trim();

  if (!/^https?:\/\//.test(url) || !publishableKey) return null;
  return { url, publishableKey };
}
