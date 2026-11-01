import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom 不会在用例之间自动卸载组件，残留的 DOM 会让 getByRole 命中上一个用例的节点
afterEach(() => {
  cleanup();
});

/**
 * jsdom 没有实现 IntersectionObserver / ResizeObserver。
 * 侧栏的"触底加载"与 Radix 的部分组件会构造它们，缺了会直接抛 ReferenceError。
 * 这里给一个空实现作为默认值；需要断言回调行为的用例可以在自己的文件里覆盖。
 */
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (!("IntersectionObserver" in globalThis)) {
  globalThis.IntersectionObserver = NoopObserver as unknown as typeof IntersectionObserver;
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver;
}
