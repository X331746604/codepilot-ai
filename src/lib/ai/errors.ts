/**
 * AI 调用的错误分类。
 *
 * 分类的意义不只是"显示一句话"，而是决定前端能不能重试：
 * - 可重试：UPSTREAM / TIMEOUT / RATE_LIMIT（等待后可再试）
 * - 不可重试：CONFIG / AUTH / QUOTA / INVALID_RESPONSE（重试只会重复失败）
 * 因此每类错误都带一个 retryable 标记，随流式事件一起下发给前端。
 */

export const AI_ERROR_CODES = [
  "CONFIG",
  "AUTH",
  "RATE_LIMIT",
  "QUOTA",
  "TIMEOUT",
  "UPSTREAM",
  "INVALID_RESPONSE",
  "CANCELED",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export type AiErrorPayload = {
  code: AiErrorCode;
  message: string;
  retryable: boolean;
};

const RETRYABLE: Record<AiErrorCode, boolean> = {
  CONFIG: false,
  AUTH: false,
  RATE_LIMIT: true,
  QUOTA: false,
  TIMEOUT: true,
  UPSTREAM: true,
  INVALID_RESPONSE: false,
  CANCELED: false,
};

const USER_MESSAGES: Record<AiErrorCode, string> = {
  CONFIG: "模型服务尚未配置，请检查服务端环境变量。",
  AUTH: "模型服务鉴权失败，API Key 可能无效或已过期。",
  RATE_LIMIT: "请求过于频繁，请稍后再试。",
  QUOTA: "模型服务额度不足，请检查账户余额。",
  TIMEOUT: "模型响应超时，可以重试或缩短输入。",
  UPSTREAM: "模型服务暂时不可用，请稍后重试。",
  INVALID_RESPONSE: "模型返回了无法解析的内容。",
  CANCELED: "请求已取消。",
};

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(
    code: AiErrorCode,
    message: string,
    options: { httpStatus?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AiError";
    this.code = code;
    this.retryable = RETRYABLE[code];
    this.httpStatus = options.httpStatus;
  }

  toPayload(): AiErrorPayload {
    return {
      code: this.code,
      message: USER_MESSAGES[this.code],
      retryable: this.retryable,
    };
  }
}

/** 把上游 HTTP 状态码映射为错误类别。 */
export function codeFromHttpStatus(status: number): AiErrorCode {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 402) return "QUOTA";
  if (status === 429) return "RATE_LIMIT";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status >= 500) return "UPSTREAM";
  return "UPSTREAM";
}

/** 任何异常都能收敛成可下发的错误载荷，避免把堆栈或密钥细节泄露给前端。 */
export function toErrorPayload(error: unknown): AiErrorPayload {
  if (error instanceof AiError) return error.toPayload();

  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "CANCELED", message: USER_MESSAGES.CANCELED, retryable: false };
  }

  return {
    code: "UPSTREAM",
    message: USER_MESSAGES.UPSTREAM,
    retryable: true,
  };
}
