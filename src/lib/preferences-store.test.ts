import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES, PREFERENCE_STORAGE_KEY, type PreferenceStorage } from "./preferences";
import { createPreferenceStore } from "./preferences-store";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  } satisfies PreferenceStorage & { data: Map<string, string> };
}

/** 跨标签页同步靠 storage 事件，用 EventTarget 模拟 window。 */
function setup(stored?: Record<string, string>) {
  const storage = fakeStorage(stored);
  const target = new EventTarget();
  const store = createPreferenceStore({ storage, target });
  return { storage, target, store };
}

/** Node 没有 StorageEvent（它是浏览器 API），用一个带 key 的 Event 顶替。 */
function storageEvent(key: string | null) {
  return Object.assign(new Event("storage"), { key });
}

describe("createPreferenceStore", () => {
  it("首次读取返回存储里的值，没有则返回默认值", () => {
    expect(setup().store.getSnapshot()).toEqual(DEFAULT_PREFERENCES);

    const seeded = setup({
      [PREFERENCE_STORAGE_KEY]: JSON.stringify({ temperature: 0.9, streaming: false }),
    });
    expect(seeded.store.getSnapshot()).toMatchObject({ temperature: 0.9, streaming: false });
  });

  it("服务端快照固定返回默认值（保证 SSR 与首帧一致）", () => {
    const { store } = setup({
      [PREFERENCE_STORAGE_KEY]: JSON.stringify({ temperature: 0.9 }),
    });
    expect(store.getServerSnapshot()).toEqual(DEFAULT_PREFERENCES);
  });

  it("getSnapshot 返回稳定引用，避免无限重渲染", () => {
    const { store } = setup();
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it("update 合并字段、清洗非法值并写入存储", () => {
    const { store, storage } = setup();

    const next = store.update({ temperature: 5, streaming: false });

    expect(next.temperature).toBe(1);
    expect(next.streaming).toBe(false);
    expect(JSON.parse(storage.data.get(PREFERENCE_STORAGE_KEY) ?? "{}")).toMatchObject({
      temperature: 1,
      streaming: false,
    });
  });

  it("update 之后快照换成新对象，未改动的字段保留", () => {
    const { store } = setup();
    const before = store.getSnapshot();

    const after = store.update({ streaming: false });

    expect(after).not.toBe(before);
    expect(after.streaming).toBe(false);
    expect(after.defaultTaskType).toBe(before.defaultTaskType);
    expect(store.getSnapshot()).toBe(after);
  });

  it("通知所有订阅者，取消订阅后不再收到", () => {
    const { store } = setup();
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = store.subscribe(first);
    store.subscribe(second);

    store.update({ temperature: 0.5 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    store.update({ temperature: 0.6 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("其它标签页写入本项目的键时重新读取", () => {
    const { store, storage, target } = setup();
    // 订阅才会挂上 storage 监听；同时先读一次把缓存填上，否则下一次读取自然是新值
    store.subscribe(() => {});
    expect(store.getSnapshot().streaming).toBe(DEFAULT_PREFERENCES.streaming);

    storage.data.set(PREFERENCE_STORAGE_KEY, JSON.stringify({ streaming: false }));
    target.dispatchEvent(storageEvent(PREFERENCE_STORAGE_KEY));

    expect(store.getSnapshot().streaming).toBe(false);
  });

  it("其它键的变化被忽略，不会白白触发重渲染", () => {
    const { store, storage, target } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getSnapshot().streaming).toBe(DEFAULT_PREFERENCES.streaming);

    storage.data.set(PREFERENCE_STORAGE_KEY, JSON.stringify({ streaming: false }));
    target.dispatchEvent(storageEvent("some-other-key"));

    expect(listener).not.toHaveBeenCalled();
    // 缓存没有失效，仍然是变更前的值
    expect(store.getSnapshot().streaming).toBe(DEFAULT_PREFERENCES.streaming);
  });

  it("存储被 clear()（key 为 null）时也重新读取", () => {
    const { store, storage, target } = setup({
      [PREFERENCE_STORAGE_KEY]: JSON.stringify({ temperature: 0.9 }),
    });
    store.subscribe(() => {});
    expect(store.getSnapshot().temperature).toBe(0.9);

    storage.data.clear();
    target.dispatchEvent(storageEvent(null));

    expect(store.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
  });

  it("reset 回到默认值并持久化", () => {
    const { store, storage } = setup();
    store.update({ temperature: 0.9, streaming: false });

    expect(store.reset()).toEqual(DEFAULT_PREFERENCES);
    expect(JSON.parse(storage.data.get(PREFERENCE_STORAGE_KEY) ?? "{}")).toEqual(
      DEFAULT_PREFERENCES,
    );
  });
});
