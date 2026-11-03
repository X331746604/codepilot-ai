import { z } from "zod";

import {
  CONVERSATION_RANGE_VALUES,
  LANGUAGE_VALUES,
  LIMITS,
  TASK_TYPE_VALUES,
} from "@/lib/constants";

export const createConversationSchema = z.object({
  taskType: z.enum(TASK_TYPE_VALUES, { error: "未知的任务类型" }),
  language: z.enum(LANGUAGE_VALUES, { error: "不支持的编程语言" }),
  title: z.string().trim().max(LIMITS.conversationTitle).optional(),
});

export const renameConversationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "标题不能为空")
    .max(LIMITS.conversationTitle, `标题不能超过 ${LIMITS.conversationTitle} 字`),
});

/** 游标是 base64url 串，长度上限给足余量即可；真正的合法性由 decodeCursor 判断。 */
const cursorParam = z.string().trim().max(200).optional();

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: cursorParam,
  q: z.string().trim().max(60).optional(),
  range: z
    .enum(CONVERSATION_RANGE_VALUES, { error: "时间范围不合法" })
    .default("all"),
});

export const idSchema = z.uuid("会话 ID 不合法");

const snippetTitle = z
  .string()
  .trim()
  .min(1, "标题不能为空")
  .max(LIMITS.snippetTitle, `标题不能超过 ${LIMITS.snippetTitle} 字`);

// 代码不做 trim：首行缩进可能是有意义的
const snippetCode = z
  .string()
  .min(1, "代码不能为空")
  .max(LIMITS.snippetCode, `代码不能超过 ${LIMITS.snippetCode} 字`)
  .refine((value) => value.trim().length > 0, "代码不能只有空白字符");

const snippetDescription = z
  .string()
  .trim()
  .max(LIMITS.snippetDescription, `描述不能超过 ${LIMITS.snippetDescription} 字`)
  .nullish();

export const createSnippetSchema = z.object({
  title: snippetTitle,
  language: z.enum(LANGUAGE_VALUES, { error: "不支持的编程语言" }),
  code: snippetCode,
  description: snippetDescription,
  sourceMessageId: z.uuid("来源消息 ID 不合法").nullish(),
});

export const updateSnippetSchema = z
  .object({
    title: snippetTitle.optional(),
    language: z.enum(LANGUAGE_VALUES, { error: "不支持的编程语言" }).optional(),
    code: snippetCode.optional(),
    description: snippetDescription,
  })
  .refine((value) => Object.keys(value).length > 0, { error: "至少提供一个要修改的字段" });

export const listSnippetQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  language: z.enum(LANGUAGE_VALUES, { error: "不支持的编程语言" }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: cursorParam,
});

export const updateProfileSchema = z.object({
  defaultLanguage: z.enum(LANGUAGE_VALUES, { error: "不支持的编程语言" }),
});
