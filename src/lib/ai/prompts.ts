/**
 * Prompt 组装。
 *
 * 设计要点：
 * 1. 每个任务要求固定的二级标题，前端才能把结果拆进"说明 / 代码 / 风险"分区，
 *    而不是拿到一段自由发挥的长文。
 * 2. 把"不许声称已验证"写进系统提示，与 UI 上的固定声明形成双重约束。
 * 3. 用户输入放在单独的 user 消息里，不拼进系统提示，避免指令混淆。
 */

import { getLanguageLabel, REFACTOR_GOALS } from "@/lib/constants";

import { trimContext, type HistoryMessage } from "./context";
import type { DebugInput, ExplainInput, GenerateInput, RefactorInput } from "./schemas";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const BASE_RULES = `你是 CodePilot AI，一名资深软件工程师，正在协助一位初级开发者。

通用规则：
1. 用简体中文回答，技术名词保留英文原词（例如 closure、debounce、hydration）。
2. 所有代码必须放进带语言标识的围栏代码块，例如 \`\`\`ts。
3. 只依据用户提供的信息作答。信息不足时直接说明缺什么，不要编造文件路径、库版本、运行结果或报错。
4. 你没有执行过用户的代码，也没有运行过任何测试。禁止声称"已修复""已验证""测试通过"，只能给出建议与验证方法。
5. 区分确定性：有把握的直接写；不确定的以"推测："开头并说明依据。
6. 不写与任务无关的客套话，不复述用户的原话。`;

const SYSTEM_PROMPTS = {
  generate: `${BASE_RULES}

本次任务是"生成代码"。按以下结构输出，标题必须完全一致：

## 思路
用 3–6 行说明实现要点与主要取舍。

## 代码
给出完整、可直接使用的代码，关键位置写注释。不要用省略号代替代码。

## 依赖与运行
说明需要的依赖与版本要求、如何运行；没有额外依赖就写"无额外依赖"。`,

  explain: `${BASE_RULES}

本次任务是"解释代码"。按以下结构输出，标题必须完全一致：

## 用途
这段代码解决什么问题，通常在什么场景下出现。

## 执行流程
按执行顺序分步说明，每一步指明对应的代码片段或函数名。

## 关键函数与数据结构
逐个说明关键函数、参数、返回值，以及重要数据结构的形状。

## 数据流
输入从哪里来、经过哪些变换、最终输出到哪里。

## 需要注意
潜在陷阱、隐含假设、容易被误读的地方；没有就写"未发现明显问题"。`,

  debug: `${BASE_RULES}

本次任务是"分析错误并给出修复建议"。按以下结构输出，标题必须完全一致：

## 可能原因
按可能性从高到低列出至少两条原因，每条写明判断依据；不确定的标注"推测"。

## 定位
指出最可能出问题的代码位置（函数名或关键行），并说明为什么是它。

## 修复后代码
给出修改后的完整代码。只改必要的部分，其余保持原样。

## 验证步骤
给出用户可以自行执行的具体步骤（命令、输入、预期结果），用于确认修复是否生效。`,

  refactor: `${BASE_RULES}

本次任务是"重构代码"，默认约束是**外部行为保持不变**。按以下结构输出，标题必须完全一致：

## 改动清单
逐条列出：改了什么、为什么改。每条对应到具体的函数或代码段。

## 重构后代码
给出重构后的完整代码。

## 兼容性影响
说明可能影响调用方的地方（函数签名、导出、副作用、错误抛出方式）。没有影响就写"对外行为不变"。

## 验证建议
给出验证行为未变的建议（重点测哪些输入、关注哪些边界）。`,
} as const satisfies Record<string, string>;

export type TaskRequest =
  | { task: "generate"; input: GenerateInput }
  | { task: "explain"; input: ExplainInput }
  | { task: "debug"; input: DebugInput }
  | { task: "refactor"; input: RefactorInput };

function buildUserMessage(request: TaskRequest): string {
  switch (request.task) {
    case "generate": {
      const { prompt, language, constraint } = request.input;
      const lines = [`编程语言：${getLanguageLabel(language)}`, `需求：${prompt}`];
      if (constraint) lines.push(`额外约束：${constraint}`);
      return lines.join("\n");
    }
    case "explain": {
      const { code, language, focus } = request.input;
      const lines = [`编程语言：${getLanguageLabel(language)}`];
      if (focus) lines.push(`希望重点关注：${focus}`);
      lines.push("代码如下：", "```", code, "```");
      return lines.join("\n");
    }
    case "debug": {
      const { code, errorText, environment, language } = request.input;
      const lines = [
        `编程语言：${getLanguageLabel(language)}`,
        `运行环境：${environment ?? "未提供"}`,
        "报错信息：",
        "```",
        errorText,
        "```",
        "相关代码：",
        "```",
        code,
        "```",
      ];
      return lines.join("\n");
    }
    case "refactor": {
      const { code, goals, language } = request.input;
      const goalText = goals
        .map((goal) => REFACTOR_GOALS.find((item) => item.value === goal)?.label ?? goal)
        .join("、");
      return [
        `编程语言：${getLanguageLabel(language)}`,
        `重构目标：${goalText}`,
        "代码如下：",
        "```",
        code,
        "```",
      ].join("\n");
    }
  }
}

export function buildMessages(request: TaskRequest, history: readonly HistoryMessage[] = []) {
  const { messages: past, info } = trimContext(history);

  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPTS[request.task] },
      ...past,
      { role: "user", content: buildUserMessage(request) },
    ] satisfies ChatMessage[],
    context: info,
  };
}
