import { describe, expect, it } from "vitest";

import { extractCodeBlocks } from "./extract-code";

describe("extractCodeBlocks", () => {
  it("没有代码块时返回空数组", () => {
    expect(extractCodeBlocks("只有一段说明文字")).toEqual([]);
  });

  it("提取单个带语言标识的代码块", () => {
    const markdown = ["## 代码", "```ts", "const a = 1;", "```"].join("\n");
    expect(extractCodeBlocks(markdown)).toEqual([{ language: "ts", code: "const a = 1;" }]);
  });

  it("按出现顺序提取多个代码块", () => {
    const markdown = ["```ts", "a", "```", "说明", "```python", "b", "```"].join("\n");
    expect(extractCodeBlocks(markdown)).toEqual([
      { language: "ts", code: "a" },
      { language: "python", code: "b" },
    ]);
  });

  it("没有语言标识时 language 为空串", () => {
    expect(extractCodeBlocks(["```", "plain", "```"].join("\n"))).toEqual([
      { language: "", code: "plain" },
    ]);
  });

  it("跳过内容为空的围栏块", () => {
    expect(extractCodeBlocks(["```ts", "   ", "```"].join("\n"))).toEqual([]);
  });

  it("去掉代码尾部的换行，避免面板里多出空行", () => {
    const markdown = ["```js", "a", "", "", "```"].join("\n");
    expect(extractCodeBlocks(markdown)[0]?.code).toBe("a");
  });

  it("保留代码内部的空行与缩进", () => {
    const code = "function a() {\n  return 1;\n}\n\nconst b = 2;";
    const markdown = ["```js", code, "```"].join("\n");
    expect(extractCodeBlocks(markdown)[0]?.code).toBe(code);
  });

  it("语言标识后可以带附加信息", () => {
    expect(extractCodeBlocks(["```ts title=app.ts", "x", "```"].join("\n"))[0]?.language).toBe(
      "ts",
    );
  });

  it("识别含 + # . - 的语言标识", () => {
    expect(extractCodeBlocks(["```c++", "x", "```"].join("\n"))[0]?.language).toBe("c++");
    expect(extractCodeBlocks(["```html-css", "x", "```"].join("\n"))[0]?.language).toBe("html-css");
  });

  it("连续调用结果一致（正则 lastIndex 已重置）", () => {
    const markdown = ["```ts", "a", "```"].join("\n");
    expect(extractCodeBlocks(markdown)).toEqual(extractCodeBlocks(markdown));
  });

  it("已知缺陷：代码块内再出现围栏时整段被丢弃", () => {
    // 正则把内层的 ``` 当成外层闭合，解析出空代码块后跳过，最终一块都拿不到。
    // 这是模块注释里写明的限制，将来换成 mdast 遍历时这条断言应当改为"正确提取 1 段"。
    const markdown = ["```md", "```ts", "inner", "```", "```"].join("\n");
    expect(extractCodeBlocks(markdown)).toEqual([]);
  });
});
