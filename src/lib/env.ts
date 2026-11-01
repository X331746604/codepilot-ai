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

export type SupabaseConfig = { url: string; key: string };

export type SupabaseConfigResult =
  | { ok: true; config: SupabaseConfig }
  | { ok: false; missing: string[] };

/**
 * 数据库凭据。
 * 兼容 Supabase 的两代密钥：新版 sb_secret_* 与旧版 service_role（JWT）。
 * 两者都拥有绕过 RLS 的权限，因此只允许在服务端读取。
 */
export function readSupabaseConfig(): SupabaseConfigResult {
  const url = (process.env.SUPABASE_URL?.trim() ?? "").replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  const missing: string[] = [];
  if (!/^https?:\/\//.test(url)) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SECRET_KEY");

  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, config: { url, key } };
}
