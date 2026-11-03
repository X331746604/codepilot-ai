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
 * 会话 ID。带上它表示"在这条会话里继续"：
 * 服务端会从数据库读历史、写入本轮消息；不带则视为新会话，由服务端创建。
 */
const conversationIdSchema = z.uuid("会话 ID 不合法").optional();

/**
 * 模型调用参数，由前端按用户偏好下发。
 *
 * 前端已经清洗过一遍，这里仍然校验：偏好存在 localStorage 里，
 * 用户手动改一下就能绕过一切前端限制，服务端不能假设它合法。
 */
export const modelOptionsSchema = z
  .object({
    temperature: z
      .number()
      .min(0, "temperature 需在 0–1 之间")
      .max(1, "temperature 需在 0–1 之间")
      .optional(),
    stream: z.boolean().optional(),
  })
  .optional();

export type ModelOptions = z.infer<typeof modelOptionsSchema>;

export const generateInputSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "请先描述你的需求")
    .max(LIMITS.prompt, `需求描述不能超过 ${LIMITS.prompt} 字`),
  language: languageSchema,
  conversationId: conversationIdSchema,
  options: modelOptionsSchema,
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
  conversationId: conversationIdSchema,
  options: modelOptionsSchema,
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
  conversationId: conversationIdSchema,
  options: modelOptionsSchema,
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
  conversationId: conversationIdSchema,
  options: modelOptionsSchema,
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
