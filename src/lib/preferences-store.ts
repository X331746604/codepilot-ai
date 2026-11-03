/**
 * 偏好的外部存储（供 useSyncExternalStore 使用）。
 *
 * 为什么不用 useState + useEffect 读 localStorage：
 * 1. 服务端渲染时读不到 localStorage，首屏必然与客户端不一致；
 * 2. 在 effect 里 setState 会多一次渲染，React Compiler 的
 *    set-state-in-effect 规则也会拦下。
 * useSyncExternalStore 恰好解决这两点：服务端快照固定返回默认值，
 * 客户端 hydration 后再用真实快照校正。
 *
 * 缓存是必需的：getSnapshot 每次返回新对象会让 React 判定"一直在变"，
 * 直接进入无限重渲染。因此只在写入或收到 storage 事件时替换缓存。
 */

import {
  DEFAULT_PREFERENCES,
  PREFERENCE_STORAGE_KEY,
  readPreferences,
  sanitizePreferences,
  writePreferences,
  type Preferences,
  type PreferenceStorage,
} from "./preferences";

type EventTargetLike = Pick<Window, "addEventListener" | "removeEventListener">;

export type PreferenceStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Preferences;
  getServerSnapshot: () => Preferences;
  update: (patch: Partial<Preferences>) => Preferences;
  reset: () => Preferences;
};

export function createPreferenceStore(
  options: { storage?: PreferenceStorage; target?: EventTargetLike } = {},
): PreferenceStore {
  let cached: Preferences | null = null;
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  function getSnapshot(): Preferences {
    if (cached === null) cached = readPreferences(options.storage);
    return cached;
  }

  function commit(next: Preferences): Preferences {
    cached = next;
    writePreferences(next, options.storage);
    notify();
    return next;
  }

  return {
    getSnapshot,

    // 服务端与 hydration 阶段固定用默认值；挂载后 React 会立刻用 getSnapshot 校正
    getServerSnapshot: () => DEFAULT_PREFERENCES,

    subscribe(listener) {
      listeners.add(listener);

      const target = options.target ?? (typeof window === "undefined" ? null : window);
      const onStorage = (event: Event) => {
        const key = (event as StorageEvent).key;
        // key 为 null 表示整份存储被清空（clear()），同样需要重新读取
        if (key !== null && key !== PREFERENCE_STORAGE_KEY) return;
        cached = null;
        notify();
      };

      target?.addEventListener("storage", onStorage);

      return () => {
        listeners.delete(listener);
        target?.removeEventListener("storage", onStorage);
      };
    },

    update(patch) {
      // 走一遍清洗：调用方传进来的值不一定是合法的（例如输入框里的空串）
      return commit(sanitizePreferences({ ...getSnapshot(), ...patch }));
    },

    reset: () => commit({ ...DEFAULT_PREFERENCES }),
  };
}
