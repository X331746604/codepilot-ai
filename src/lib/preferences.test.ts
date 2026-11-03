import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  normalizeTemperature,
  PREFERENCE_STORAGE_KEY,
  readPreferences,
  sanitizePreferences,
  TEMPERATURE_RANGE,
  writePreferences,
  type PreferenceStorage,
} from "./preferences";

/** 最小可用的假 localStorage：只为验证读写与容错，不模拟完整 Web Storage。 */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: PreferenceStorage & { data: Map<string, string> } = {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  return storage;
}

describe("sanitizePreferences", () => {
  it("非对象输入整份回退到默认值", () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences("x")).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it("空对象得到默认值", () => {
    expect(sanitizePreferences({})).toEqual(DEFAULT_PREFERENCES);
  });

  it("逐字段回退：一个字段坏掉不影响其它字段", () => {
    const result = sanitizePreferences({
      defaultTaskType: "chat",
      defaultLanguage: "python",
      temperature: 0.8,
      streaming: false,
    });
    expect(result.defaultTaskType).toBe(DEFAULT_PREFERENCES.defaultTaskType);
    expect(result.defaultLanguage).toBe("python");
    expect(result.temperature).toBe(0.8);
    expect(result.streaming).toBe(false);
  });

  it("未知字段被丢弃，不会写回存储", () => {
    const result = sanitizePreferences({ apiKey: "sk-should-not-persist", streaming: true });
    expect(result).not.toHaveProperty("apiKey");
    expect(Object.keys(result).sort()).toEqual([
      "defaultLanguage",
      "defaultTaskType",
      "streaming",
      "temperature",
    ]);
  });

  it("温度超出范围时夹到 0–1", () => {
    expect(sanitizePreferences({ temperature: 5 }).temperature).toBe(TEMPERATURE_RANGE.max);
    expect(sanitizePreferences({ temperature: -2 }).temperature).toBe(TEMPERATURE_RANGE.min);
  });

  it("温度不是数字时回退默认值", () => {
    expect(sanitizePreferences({ temperature: "0.9" }).temperature).toBe(
      DEFAULT_PREFERENCES.temperature,
    );
    expect(sanitizePreferences({ temperature: Number.NaN }).temperature).toBe(
      DEFAULT_PREFERENCES.temperature,
    );
  });

  it("流式开关必须是布尔值，字符串不认", () => {
    expect(sanitizePreferences({ streaming: "false" }).streaming).toBe(
      DEFAULT_PREFERENCES.streaming,
    );
  });
});

describe("normalizeTemperature", () => {
  it("按 0.1 步长取整，消掉浮点噪声", () => {
    expect(normalizeTemperature(0.1 + 0.2)).toBe(0.3);
    expect(normalizeTemperature(0.74)).toBe(0.7);
    expect(normalizeTemperature(0.76)).toBe(0.8);
  });

  it("边界值保持不动", () => {
    expect(normalizeTemperature(0)).toBe(0);
    expect(normalizeTemperature(1)).toBe(1);
  });
});

describe("readPreferences", () => {
  it("没有存储时返回默认值", () => {
    expect(readPreferences(null as unknown as PreferenceStorage)).toEqual(DEFAULT_PREFERENCES);
  });

  it("键不存在时返回默认值", () => {
    expect(readPreferences(fakeStorage())).toEqual(DEFAULT_PREFERENCES);
  });

  it("读到损坏的 JSON 时回退，而不是抛错", () => {
    const storage = fakeStorage({ [PREFERENCE_STORAGE_KEY]: "{not json" });
    expect(readPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  it("读到部分可用的数据时保留可用字段", () => {
    const storage = fakeStorage({
      [PREFERENCE_STORAGE_KEY]: JSON.stringify({ defaultLanguage: "go", temperature: 0.9 }),
    });
    expect(readPreferences(storage)).toMatchObject({
      defaultLanguage: "go",
      temperature: 0.9,
      defaultTaskType: DEFAULT_PREFERENCES.defaultTaskType,
    });
  });
});

describe("writePreferences", () => {
  it("写入后能原样读回", () => {
    const storage = fakeStorage();
    const next = { ...DEFAULT_PREFERENCES, defaultLanguage: "python" as const, temperature: 0.7 };

    expect(writePreferences(next, storage)).toBe(true);
    expect(readPreferences(storage)).toEqual(next);
  });

  it("写入的是清洗后的值，不会把非法温度落盘", () => {
    const storage = fakeStorage();
    writePreferences({ ...DEFAULT_PREFERENCES, temperature: 3 }, storage);
    expect(readPreferences(storage).temperature).toBe(1);
  });

  it("存储不可用（隐私模式）时返回 false 而不是抛错", () => {
    const throwing: PreferenceStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    };
    expect(writePreferences(DEFAULT_PREFERENCES, throwing)).toBe(false);
  });

  it("不写任何敏感字段", () => {
    const storage = fakeStorage();
    writePreferences(DEFAULT_PREFERENCES, storage);
    const raw = storage.data.get(PREFERENCE_STORAGE_KEY) ?? "";
    expect(raw).not.toMatch(/sk-|api[_-]?key|secret|token/i);
  });
});
