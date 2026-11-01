import { describe, expect, it } from "vitest";

import {
  CONVERSATION_RANGES,
  CONVERSATION_RANGE_VALUES,
  getLanguageLabel,
  getTaskType,
  LANGUAGE_VALUES,
  rangeToSince,
  REFACTOR_GOAL_VALUES,
  TASK_TYPE_VALUES,
} from "./constants";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");

describe("rangeToSince", () => {
  it("all 不加时间条件", () => {
    expect(rangeToSince("all", NOW)).toBeNull();
  });

  it("7d 精确回拨 7 天", () => {
    expect(rangeToSince("7d", NOW)).toBe("2026-10-25T12:00:00.000Z");
  });

  it("30d 精确回拨 30 天", () => {
    expect(rangeToSince("30d", NOW)).toBe("2026-10-02T12:00:00.000Z");
  });

  it("输出是带时区信息的 ISO 串，跨时区不会漂移", () => {
    expect(rangeToSince("7d", NOW)).toMatch(/Z$/);
  });
});

describe("范围与语言的取值表", () => {
  it("UI 上的三个时间范围与服务端校验共用同一份", () => {
    expect(CONVERSATION_RANGE_VALUES).toEqual(["all", "7d", "30d"]);
    expect(CONVERSATION_RANGES[1]).toMatchObject({ days: 7 });
  });

  it("语言表覆盖所有受支持语言且无重复", () => {
    expect(new Set(LANGUAGE_VALUES).size).toBe(LANGUAGE_VALUES.length);
    expect(LANGUAGE_VALUES).toContain("typescript");
  });

  it("未知语言原样返回，界面不会显示成空白", () => {
    expect(getLanguageLabel("rust")).toBe("rust");
  });

  it("已知语言返回展示名", () => {
    expect(getLanguageLabel("html-css")).toBe("HTML / CSS");
  });

  it("未知任务类型退回第一个，避免渲染崩溃", () => {
    // @ts-expect-error 故意传入非法值，验证运行时的兜底
    expect(getTaskType("unknown").value).toBe(TASK_TYPE_VALUES[0]);
  });

  it("重构目标顺序稳定（界面按此顺序渲染）", () => {
    expect(REFACTOR_GOAL_VALUES).toEqual([
      "naming",
      "split",
      "dedupe",
      "readability",
      "performance",
    ]);
  });
});
