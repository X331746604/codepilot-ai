import { z } from "zod";

import { LANGUAGE_VALUES, LIMITS, TASK_TYPE_VALUES } from "@/lib/constants";

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

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const idSchema = z.uuid("会话 ID 不合法");
