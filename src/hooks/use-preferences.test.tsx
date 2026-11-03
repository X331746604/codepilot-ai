import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES, PREFERENCE_STORAGE_KEY } from "@/lib/preferences";

/**
 * 每个用例重新 import，拿到一个全新的 store 单例。
 * 否则上一个用例写进 localStorage 的偏好会污染下一个用例。
 */
async function setup() {
  vi.resetModules();
  const { usePreferences } = await import("./use-preferences");
  return renderHook(() => usePreferences());
}

afterEach(() => {
  localStorage.clear();
});

describe("usePreferences", () => {
  it("首次渲染使用默认值，挂载后切换到存储里的真实值", async () => {
    localStorage.setItem(
      PREFERENCE_STORAGE_KEY,
      JSON.stringify({ defaultLanguage: "python", temperature: 0.8 }),
    );

    const { result } = await setup();

    // 挂载完成后（renderHook 已 flush effect）应当读到 localStorage 的值
    expect(result.current.preferences.defaultLanguage).toBe("python");
    expect(result.current.preferences.temperature).toBe(0.8);
    expect(result.current.preferences.defaultTaskType).toBe(
      DEFAULT_PREFERENCES.defaultTaskType,
    );
  });

  it("update 立即生效并写入 localStorage", async () => {
    const { result } = await setup();

    act(() => {
      result.current.update({ defaultTaskType: "refactor", streaming: false });
    });

    expect(result.current.preferences.defaultTaskType).toBe("refactor");
    expect(result.current.preferences.streaming).toBe(false);

    const stored = JSON.parse(localStorage.getItem(PREFERENCE_STORAGE_KEY) ?? "{}");
    expect(stored).toMatchObject({ defaultTaskType: "refactor", streaming: false });
  });

  it("非法值被清洗，不会写进存储", async () => {
    const { result } = await setup();

    act(() => {
      result.current.update({ temperature: 9 });
    });

    expect(result.current.preferences.temperature).toBe(1);
    const stored = JSON.parse(localStorage.getItem(PREFERENCE_STORAGE_KEY) ?? "{}");
    expect(stored.temperature).toBe(1);
  });

  it("reset 回到默认值", async () => {
    const { result } = await setup();

    act(() => {
      result.current.update({ defaultLanguage: "go", temperature: 0.1 });
    });
    expect(result.current.preferences.defaultLanguage).toBe("go");

    act(() => {
      result.current.reset();
    });

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(JSON.parse(localStorage.getItem(PREFERENCE_STORAGE_KEY) ?? "{}")).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it("多个组件共享同一份状态", async () => {
    vi.resetModules();
    const { usePreferences } = await import("./use-preferences");

    const first = renderHook(() => usePreferences());
    const second = renderHook(() => usePreferences());

    act(() => {
      first.result.current.update({ temperature: 0.9 });
    });

    expect(second.result.current.preferences.temperature).toBe(0.9);
  });

  it("不把任何密钥写进 localStorage", async () => {
    const { result } = await setup();

    act(() => {
      result.current.update({ temperature: 0.5 });
    });

    expect(localStorage.getItem(PREFERENCE_STORAGE_KEY) ?? "").not.toMatch(
      /sk-|api[_-]?key|secret/i,
    );
  });
});
