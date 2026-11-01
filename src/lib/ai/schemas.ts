/**
 * 请求体校验。前端提交的所有内容都必须先过这里。
 *
 * 阈值统一取自 `@/lib/constants`，与输入框的字符计数共用同一份配置，
 * 避免出现"前端允许 8000 字、后端只收 4000 字"这类不一致。
 */

import { z } from "zod";

import {
  LANGUAGE_VALUES,
  LIMITS,
  REFACTOR_GOAL_VALUES,
  TASK_TYPE_VALUES,
  type RefactorGoal,
  type TaskType,
} from "@/lib/constants";

const languageSchema = z.enum(LANGUAGE_VALUES, { error: "不支持的编程语言" });

/**
 * 历史消息。客户端只发最近若干轮，服务端仍会按 CONTEXT_WINDOW 二次裁剪，
 * 这里只做"别把请求体撑爆"的粗粒度限制。
 */
export const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"], { error: "历史消息角色只能是 user 或 assistant" }),
  content: z
    .string()
    .min(1, "历史消息不能为空")
    .max(LIMITS.code * 2, `单条历史消息不能超过 ${LIMITS.code * 2} 字`),
});

export const historySchema = z
  .array(historyMessageSchema)
  .max(20, "历史消息最多 20 条")
  .optional();

export type HistoryMessageInput = z.infer<typeof historyMessageSchema>;

export const generateInputSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "请先描述你的需求")
    .max(LIMITS.prompt, `需求描述不能超过 ${LIMITS.prompt} 字`),
  language: languageSchema,
  history: historySchema,
  constraint: z
    .string()
    .trim()
    .max(LIMITS.constraint, `额外约束不能超过 ${LIMITS.constraint} 字`)
    .optional(),
});

export const explainInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "请粘贴需要解释的代码")
    .max(LIMITS.code, `代码不能超过 ${LIMITS.code} 字`),
  language: languageSchema,
  history: historySchema,
  focus: z.string().trim().max(200, "关注点描述过长").optional(),
});

export const debugInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "请粘贴出错的代码")
    .max(LIMITS.code, `代码不能超过 ${LIMITS.code} 字`),
  errorText: z
    .string()
    .trim()
    .min(1, "请粘贴报错信息——没有它，分析只能靠猜")
    .max(LIMITS.errorText, `报错信息不能超过 ${LIMITS.errorText} 字`),
  environment: z.string().trim().max(200, "运行环境描述过长").optional(),
  language: languageSchema,
  history: historySchema,
});

export const refactorGoalValues = REFACTOR_GOAL_VALUES;

export type { RefactorGoal };

export const refactorInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "请粘贴需要重构的代码")
    .max(LIMITS.code, `代码不能超过 ${LIMITS.code} 字`),
  goals: z
    .array(z.enum(refactorGoalValues, { error: "未知的重构目标" }))
    .min(1, "至少选择一个重构目标")
    .max(refactorGoalValues.length),
  language: languageSchema,
  history: historySchema,
});

export type GenerateInput = z.infer<typeof generateInputSchema>;
export type ExplainInput = z.infer<typeof explainInputSchema>;
export type DebugInput = z.infer<typeof debugInputSchema>;
export type RefactorInput = z.infer<typeof refactorInputSchema>;

export type TaskInputMap = {
  generate: GenerateInput;
  explain: ExplainInput;
  debug: DebugInput;
  refactor: RefactorInput;
};

export const TASK_INPUT_SCHEMAS = {
  generate: generateInputSchema,
  explain: explainInputSchema,
  debug: debugInputSchema,
  refactor: refactorInputSchema,
} as const;

/** 供路由做参数校验用：只接受已知的四类任务。 */
export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPE_VALUES as readonly string[]).includes(value);
}

export type FieldIssue = { path: string; message: string };

/** 把 Zod 的错误列表压平成前端好渲染的字段级结构。 */
export function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "body",
    message: issue.message,
  }));
}
