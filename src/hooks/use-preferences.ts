"use client";

import { useSyncExternalStore } from "react";

import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences";
import { createPreferenceStore } from "@/lib/preferences-store";

/**
 * 单例：整个应用共享一份偏好与一组订阅者。
 * 如果每个组件各建一个 store，跨标签页同步会变成 N 份监听，
 * 而且 A 组件改了值、B 组件不会立刻知道。
 */
const store = createPreferenceStore();

export type UsePreferences = {
  preferences: Preferences;
  /** 局部更新，未传的字段保持不变 */
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
};

export function usePreferences(): UsePreferences {
  // 服务端与 hydration 阶段读 getServerSnapshot（固定默认值），挂载后再用真实值校正，
  // 因此不会出现"服务端渲染一套、客户端另一套"的 hydration 报错。
  const preferences = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  return {
    preferences,
    update: store.update,
    reset: store.reset,
  };
}

export { DEFAULT_PREFERENCES };
