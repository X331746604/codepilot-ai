/**
 * 数据库错误 → HTTP 响应。
 *
 * 对外只给稳定错误码与中性文案：把 PostgREST 的原始 message 直接抛给前端，
 * 既可能暴露表结构，也会让用户看到 "duplicate key value violates..." 这类噪音。
 * 详细信息只进服务端日志。
 */

import { DatabaseNotConfiguredError } from "./client";
import { DbError } from "./conversations";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export function jsonOk(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: NO_STORE });
}

export function dbErrorResponse(error: unknown): Response {
  if (error instanceof DatabaseNotConfiguredError) {
    return jsonError(503, "CONFIG", "数据库未配置，请检查服务端环境变量");
  }

  if (error instanceof DbError) {
    console.error(
      JSON.stringify({ scope: "db.error", code: error.code, message: error.message.slice(0, 300) }),
    );
    return jsonError(500, "DB_ERROR", "数据库操作失败，请稍后重试");
  }

  console.error(
    JSON.stringify({
      scope: "db.unknown_error",
      message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }),
  );
  return jsonError(500, "INTERNAL", "服务器内部错误");
}
