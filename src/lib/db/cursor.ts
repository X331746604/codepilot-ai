/**
 * 游标分页的编解码。
 *
 * 为什么不用 offset：
 * - 会话按 last_message_at 倒序排列，每来一条新消息，列表顶部就会插入一项，
 *   offset 会整体后移，用户翻页时会重复看到同一条；
 * - offset 越大，Postgres 要扫描并丢弃的行数越多，翻到后面会明显变慢。
 *
 * 游标的载荷是「排序键 + 主键」：排序键可能重复（同一毫秒的两条会话），
 * 主键用于打破并列，保证扫描位置唯一。对外是一串 base64url，
 * 客户端不需要理解其结构，也就不会自己去构造。
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Cursor = {
  /** 排序键：会话用 last_message_at，片段用 created_at */
  ts: string;
  /** 并列时的次级排序键 */
  id: string;
};

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.ts}|${cursor.id}`, "utf8").toString("base64url");
}

/**
 * 解析失败返回 null 而不是抛错——调用方据此返回 400，
 * 而不是让一个手工改坏的 URL 把请求打进数据库。
 */
export function decodeCursor(raw: string): Cursor | null {
  let text: string;
  try {
    text = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const separator = text.lastIndexOf("|");
  if (separator <= 0) return null;

  const ts = text.slice(0, separator);
  const id = text.slice(separator + 1);

  if (!UUID_PATTERN.test(id)) return null;
  if (Number.isNaN(Date.parse(ts))) return null;

  return { ts, id };
}

/**
 * 生成 PostgREST 的 or 过滤表达式：严格小于 (ts, id)。
 *
 * 对应 SQL：`where ts < :ts or (ts = :ts and id < :id)`。
 * PostgREST 不支持行值比较，只能展开成这个等价形式。
 */
export function cursorFilter(column: string, cursor: Cursor): string {
  return `${column}.lt.${cursor.ts},and(${column}.eq.${cursor.ts},id.lt.${cursor.id})`;
}
