/**
 * 关键词搜索的公共处理。
 *
 * 会话标题与片段正文用的是同一套 `ilike '%词%'`，所以清洗规则必须共用，
 * 否则两处的搜索行为会悄悄分叉。
 */

/**
 * 清理搜索词。
 *
 * PostgREST 的 `or()` 用逗号和括号分隔条件，搜索词里出现这些字符会把过滤器
 * 拆坏；`%` 与 `_` 是 LIKE 通配符，用户输入的应该被当作字面量。
 * 直接剔除而不是转义，是因为这里只需要"能搜到大概"，不需要精确匹配语义。
 */
export function sanitizeSearch(raw: string): string {
  return raw
    .replace(/[(),%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
