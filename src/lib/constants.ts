/**
 * 全局常量：任务类型、编程语言与各类长度上限。
 *
 * 这里的取值同时被 UI（字符计数、下拉选项）与服务端校验（Zod schema）引用，
 * 保证"前端能提交的"与"后端愿意接收的"是同一套规则，避免两处阈值漂移。
 */

export const APP_NAME = "CodePilot AI";

export const APP_TAGLINE = "把需求、代码与错误，收进同一个工作台";

export const APP_DESCRIPTION =
  "CodePilot AI 是一个面向个人开发者的 AI 编程工作台：用自然语言生成代码、逐段解释陌生实现、分析报错原因并给出修复建议、把能跑的代码重构得更清晰。";

export const TASK_TYPES = [
  {
    value: "generate",
    label: "生成代码",
    description: "用自然语言描述需求，产出可直接使用的代码",
    placeholder:
      "例如：写一个 TypeScript 的 useDebounce Hook，支持泛型、可配置延迟，并在组件卸载时清理定时器。",
    submitLabel: "生成代码",
  },
  {
    value: "explain",
    label: "解释代码",
    description: "粘贴代码，得到用途、执行流程与数据流说明",
    placeholder: "把需要理解的代码粘贴到这里，越完整越好。",
    submitLabel: "解释代码",
  },
  {
    value: "debug",
    label: "分析错误",
    description: "提供代码、报错信息与运行环境，定位原因并给修复方案",
    placeholder: "把出错的代码粘贴到这里。",
    submitLabel: "分析错误",
  },
  {
    value: "refactor",
    label: "重构代码",
    description: "在保持行为不变的前提下改善命名、拆分与重复",
    placeholder: "把需要重构的代码粘贴到这里。",
    submitLabel: "重构代码",
  },
] as const;

export type TaskType = (typeof TASK_TYPES)[number]["value"];

export const DEFAULT_TASK_TYPE: TaskType = "generate";

export const TASK_TYPE_VALUES = TASK_TYPES.map((task) => task.value) as [TaskType, ...TaskType[]];

export function getTaskType(value: TaskType) {
  return TASK_TYPES.find((task) => task.value === value) ?? TASK_TYPES[0];
}

export const LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "sql", label: "SQL" },
  { value: "html-css", label: "HTML / CSS" },
  { value: "other", label: "其它" },
] as const;

export type Language = (typeof LANGUAGES)[number]["value"];

export const DEFAULT_LANGUAGE: Language = "typescript";

export const LANGUAGE_VALUES = LANGUAGES.map((language) => language.value) as [
  Language,
  ...Language[],
];

/**
 * 重构目标。放在 constants 而不是 schemas，是因为它同时被客户端的多选控件
 * 和服务端的 Zod 校验使用——若放在 schemas 里，客户端会连带打包 zod。
 */
export const REFACTOR_GOALS = [
  { value: "naming", label: "改善命名" },
  { value: "split", label: "拆分函数" },
  { value: "dedupe", label: "减少重复" },
  { value: "readability", label: "提升可读性" },
  { value: "performance", label: "优化性能" },
] as const;

export type RefactorGoal = (typeof REFACTOR_GOALS)[number]["value"];

export const REFACTOR_GOAL_VALUES = REFACTOR_GOALS.map((goal) => goal.value) as [
  RefactorGoal,
  ...RefactorGoal[],
];

export function getLanguageLabel(value: string) {
  return LANGUAGES.find((language) => language.value === value)?.label ?? value;
}

/**
 * 输入 / 输出长度上限。
 * 目的有二：控制单次调用的 token 成本，以及在提交前就给出可读的提示，
 * 而不是等模型侧返回 400 才告诉用户"太长了"。
 */
export const LIMITS = {
  /** 生成 / 重构的自然语言输入上限 */
  prompt: 8_000,
  /** 需要粘贴代码的上限 */
  code: 12_000,
  /** 报错信息上限 */
  errorText: 4_000,
  /** 额外约束上限 */
  constraint: 500,
  /** 会话标题上限 */
  conversationTitle: 60,
  /** 片段标题与描述上限 */
  snippetTitle: 100,
  snippetDescription: 500,
  snippetCode: 20_000,
} as const;

/** 单次输出上限，传给模型接口的 max_tokens */
export const MAX_OUTPUT_TOKENS = 2_048;

/**
 * 会话列表的时间范围筛选。
 *
 * 天数定义在这里而不是散落在 UI 与路由里：界面上的「近 7 天」和
 * 服务端实际用来算 `since` 的天数必须是同一个数字。
 */
export const CONVERSATION_RANGES = [
  { value: "all", label: "全部", days: null },
  { value: "7d", label: "近 7 天", days: 7 },
  { value: "30d", label: "近 30 天", days: 30 },
] as const;

export type ConversationRange = (typeof CONVERSATION_RANGES)[number]["value"];

export const CONVERSATION_RANGE_VALUES = CONVERSATION_RANGES.map((item) => item.value) as [
  ConversationRange,
  ...ConversationRange[],
];

/** 把范围换算成 ISO 起点；`all` 返回 null，表示不加时间条件。 */
export function rangeToSince(range: ConversationRange, now = Date.now()): string | null {
  const days = CONVERSATION_RANGES.find((item) => item.value === range)?.days ?? null;
  if (days === null) return null;
  return new Date(now - days * 86_400_000).toISOString();
}

/** 上下文裁剪参数：与需求文档 FR-6.4 对应 */
export const CONTEXT_WINDOW = {
  maxMessages: 10,
  maxCharsPerMessage: 4_000,
  maxTotalChars: 24_000,
} as const;
