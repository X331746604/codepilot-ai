/**
 * 用户偏好（仅限**本机 UI 与模型参数**）。
 *
 * 存储边界（需求文档 FR-9.2）：
 * - 主题、默认任务类型、温度、流式开关 → 存 **localStorage**，换设备不同步；
 * - 默认语言这类**业务偏好** → 存 `profiles` 表（见 `/api/profile`）。
 *
 * 两条线分开的理由：默认语言影响的是"生成什么代码"，属于账号数据，
 * 换台电脑必须还在；而温度和主题是个人手感，跟着浏览器走更自然。
 *
 * 这里刻意不引入 zod：schema 在服务端用，客户端再打包一份只会白增体积。
 * 手写的 sanitize 反而是更合适的工具——它的职责是"坏数据也要能用"，
 * 而 zod 的默认行为是"坏数据直接拒绝"，那是服务端校验的语义。
 */

import {
  DEFAULT_TASK_TYPE,
  DEFAULT_TEMPERATURE,
  TASK_TYPE_VALUES,
  type TaskType,
} from "@/lib/constants";

export const PREFERENCE_STORAGE_KEY = "codepilot.preferences.v1";

export type Preferences = {
  /** 打开工作台时默认选中的任务类型 */
  defaultTaskType: TaskType;
  /** 采样温度，0 最保守、1 最发散 */
  temperature: number;
  /** 关闭后上游改为非流式，浏览器侧仍按同一套事件处理 */
  streaming: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  defaultTaskType: DEFAULT_TASK_TYPE,
  // 0.3 是代码场景的常见取值：比 0 更有变化，又不至于把确定性丢掉
  temperature: DEFAULT_TEMPERATURE,
  streaming: true,
};

export const TEMPERATURE_RANGE = { min: 0, max: 1, step: 0.1 } as const;

/** 存储接口的最小子集，便于测试时注入一个假实现。 */
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && (TASK_TYPE_VALUES as readonly string[]).includes(value);
}

/** 保留一位小数：滑块的取值以 0.1 为步长，避免 0.30000000000000004 这类噪声。 */
export function normalizeTemperature(value: number): number {
  const { min, max } = TEMPERATURE_RANGE;
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped * 10) / 10;
}

/**
 * 把任意输入清洗成一份可用的偏好。
 *
 * 逐字段回退，而不是整个丢弃：用户把 temperature 手动改成字符串，
 * 不该连带让他设置的默认语言一起失效。
 */
export function sanitizePreferences(raw: unknown): Preferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES };
  const source = raw as Record<string, unknown>;

  const temperature =
    typeof source.temperature === "number" && Number.isFinite(source.temperature)
      ? normalizeTemperature(source.temperature)
      : DEFAULT_PREFERENCES.temperature;

  return {
    defaultTaskType: isTaskType(source.defaultTaskType)
      ? source.defaultTaskType
      : DEFAULT_PREFERENCES.defaultTaskType,
    temperature,
    streaming:
      typeof source.streaming === "boolean" ? source.streaming : DEFAULT_PREFERENCES.streaming,
  };
}

function resolveStorage(storage?: PreferenceStorage): PreferenceStorage | null {
  if (storage) return storage;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // 隐私模式或站点数据被禁用时，访问 localStorage 会直接抛错
    return null;
  }
}

/** 读取失败（无存储、JSON 损坏、被禁用）一律回退到默认值，不抛错。 */
export function readPreferences(storage?: PreferenceStorage): Preferences {
  const target = resolveStorage(storage);
  if (!target) return { ...DEFAULT_PREFERENCES };

  try {
    const raw = target.getItem(PREFERENCE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** 写入失败（配额满、被禁用）只影响持久化，不影响当前会话内的使用。 */
export function writePreferences(next: Preferences, storage?: PreferenceStorage): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
