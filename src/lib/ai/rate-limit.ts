/**
 * 进程内固定窗口限流。
 *
 * 为什么不用 Redis：MVP 单实例部署，引入外部存储的复杂度大于收益。
 * 已知局限（必须写进文档）：多实例/Serverless 扩容后每个实例独立计数，
 * 真实上限 = 配置值 × 实例数。任务 15 部署时若需要严格限额，再换成持久化方案。
 */

type Window = { minute: number[]; hour: number[] };

const buckets = new Map<string, Window>();

/** 防止异常流量把内存打爆；超出后整体清空，代价只是短暂放宽限流。 */
const MAX_TRACKED_KEYS = 5_000;

export type RateLimitResult =
  | { allowed: true; remainingThisMinute: number }
  | { allowed: false; reason: "minute" | "hour"; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  limits: { perMinute: number; perHour: number },
  now: number = Date.now(),
): RateLimitResult {
  if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();

  const minuteAgo = now - 60_000;
  const hourAgo = now - 3_600_000;

  const current = buckets.get(key) ?? { minute: [], hour: [] };
  current.minute = current.minute.filter((ts) => ts > minuteAgo);
  current.hour = current.hour.filter((ts) => ts > hourAgo);

  if (current.minute.length >= limits.perMinute) {
    const oldest = current.minute[0] ?? now;
    buckets.set(key, current);
    return {
      allowed: false,
      reason: "minute",
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000)),
    };
  }

  if (current.hour.length >= limits.perHour) {
    const oldest = current.hour[0] ?? now;
    buckets.set(key, current);
    return {
      allowed: false,
      reason: "hour",
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + 3_600_000 - now) / 1000)),
    };
  }

  current.minute.push(now);
  current.hour.push(now);
  buckets.set(key, current);

  return { allowed: true, remainingThisMinute: limits.perMinute - current.minute.length };
}

/** 仅用于测试：清空计数状态。 */
export function resetRateLimit(): void {
  buckets.clear();
}
