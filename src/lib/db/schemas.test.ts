import { describe, expect, it } from "vitest";

import { LIMITS } from "@/lib/constants";

import {
  createConversationSchema,
  createSnippetSchema,
  idSchema,
  listQuerySchema,
  listSnippetQuerySchema,
  renameConversationSchema,
  updateSnippetSchema,
} from "./schemas";

describe("createConversationSchema", () => {
  it("只传任务类型与语言即可", () => {
    expect(createConversationSchema.safeParse({ taskType: "debug", language: "go" }).success).toBe(
      true,
    );
  });

  it("标题超过上限被拒绝", () => {
    expect(
      createConversationSchema.safeParse({
        taskType: "debug",
        language: "go",
        title: "x".repeat(LIMITS.conversationTitle + 1),
      }).success,
    ).toBe(false);
  });

  it("未知任务类型被拒绝", () => {
    expect(createConversationSchema.safeParse({ taskType: "chat", language: "go" }).success).toBe(
      false,
    );
  });
});

describe("renameConversationSchema", () => {
  it("空标题被拒绝", () => {
    const result = renameConversationSchema.safeParse({ title: "   " });
    expect(result.success).toBe(false);
  });

  it("首尾空白被裁掉", () => {
    const result = renameConversationSchema.safeParse({ title: "  新名字  " });
    expect(result.success && result.data.title).toBe("新名字");
  });
});

describe("listQuerySchema", () => {
  it("不传参数时给出默认值", () => {
    const result = listQuerySchema.parse({});
    expect(result).toEqual({ limit: 20, cursor: undefined, q: undefined, range: "all" });
  });

  it("limit 从查询串（字符串）转成数字", () => {
    expect(listQuerySchema.parse({ limit: "10" }).limit).toBe(10);
  });

  it("limit 越界被拒绝", () => {
    expect(listQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
  });

  it("时间范围只接受三个取值", () => {
    expect(listQuerySchema.parse({ range: "7d" }).range).toBe("7d");
    expect(listQuerySchema.safeParse({ range: "1y" }).success).toBe(false);
  });
});

describe("idSchema", () => {
  it("接受 UUID，拒绝其它形状", () => {
    expect(idSchema.safeParse("3f2b8c1e-8a4d-4f6b-9c2e-1d5a7b9c0e34").success).toBe(true);
    expect(idSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});

describe("createSnippetSchema", () => {
  const base = { title: "标题", language: "typescript", code: "const a = 1" };

  it("最小合法输入通过", () => {
    expect(createSnippetSchema.safeParse(base).success).toBe(true);
  });

  it("纯空白代码被拒绝（不是只靠长度判断）", () => {
    expect(createSnippetSchema.safeParse({ ...base, code: "   " }).success).toBe(false);
  });

  it("代码超长被拒绝", () => {
    expect(
      createSnippetSchema.safeParse({ ...base, code: "x".repeat(LIMITS.snippetCode + 1) }).success,
    ).toBe(false);
  });

  it("描述可以为 null 或省略", () => {
    expect(createSnippetSchema.safeParse({ ...base, description: null }).success).toBe(true);
    expect(createSnippetSchema.safeParse(base).success).toBe(true);
  });

  it("来源消息 ID 必须是 UUID", () => {
    expect(createSnippetSchema.safeParse({ ...base, sourceMessageId: "abc" }).success).toBe(false);
  });
});

describe("updateSnippetSchema", () => {
  it("空对象被拒绝，避免无意义的写库", () => {
    expect(updateSnippetSchema.safeParse({}).success).toBe(false);
  });

  it("只改一个字段就够", () => {
    expect(updateSnippetSchema.safeParse({ title: "新标题" }).success).toBe(true);
  });
});

describe("listSnippetQuerySchema", () => {
  it("默认每页 30 条", () => {
    expect(listSnippetQuerySchema.parse({}).limit).toBe(30);
  });

  it("上限 100", () => {
    expect(listSnippetQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("语言必须是已知取值", () => {
    expect(listSnippetQuerySchema.safeParse({ language: "rust" }).success).toBe(false);
  });
});
