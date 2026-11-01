/**
 * 从 Markdown 里提取围栏代码块，供右侧"代码"面板展示。
 *
 * 说明：这是正则实现，不解析 Markdown 语法。对于含 ``` 的字符串内容
 * （例如示例里教人怎么写围栏）会切分错误。MVP 阶段可接受，后续若需要
 * 严谨解析，应改为遍历 mdast 而非正则。
 */
export type CodeBlockInfo = { language: string; code: string };

const FENCE_PATTERN = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g;

export function extractCodeBlocks(markdown: string): CodeBlockInfo[] {
  const blocks: CodeBlockInfo[] = [];
  FENCE_PATTERN.lastIndex = 0;

  let match = FENCE_PATTERN.exec(markdown);
  while (match !== null) {
    const code = match[2]?.replace(/\s+$/, "") ?? "";
    if (code.trim()) blocks.push({ language: match[1] ?? "", code });
    match = FENCE_PATTERN.exec(markdown);
  }

  return blocks;
}
