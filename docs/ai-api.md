# AI 接口契约（任务 5 产出）

四个接口共用同一套协议，只有请求体不同。前端按本文档解析即可，不需要关心具体供应商。

## 1. 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai/generate` | 生成代码 |
| POST | `/api/ai/explain` | 解释代码 |
| POST | `/api/ai/debug` | 错误分析 |
| POST | `/api/ai/refactor` | 重构代码 |
| GET | `/api/health` | 部署自检（配置是否就绪） |

## 2. 请求体

字段长度上限与前端输入框一致，来源为 `src/lib/constants.ts`。

```jsonc
// generate
{ "prompt": "1–8000 字", "language": "typescript", "constraint": "≤500 字，可选" }

// explain
{ "code": "1–12000 字", "language": "typescript", "focus": "≤200 字，可选" }

// debug
{ "code": "1–12000 字", "errorText": "1–4000 字，必填", "environment": "≤200 字，可选", "language": "typescript" }

// refactor
{ "code": "1–12000 字", "goals": ["naming", "split"], "language": "typescript" }
```

`language` 取值：`typescript | javascript | python | java | go | sql | html-css | other`
`goals` 取值：`naming | split | dedupe | readability | performance`，至少一项。

## 3. 成功响应（`text/event-stream`）

每行一个事件，格式为 `data: {json}\n\n`。

| 事件 | 载荷 | 说明 |
|---|---|---|
| `meta` | `{ requestId, task, model }` | 流开始，前端可据此记录 requestId |
| `delta` | `{ text }` | 增量文本，直接追加渲染 |
| `done` | `{ usage, model, finishReason }` | 结束；`usage` 为真实 token 用量，可能为 `null` |
| `error` | `{ error: { code, message, retryable } }` | 出错；之后流即结束 |

示例：

```
data: {"type":"meta","requestId":"...","task":"generate","model":"qwen-plus"}

data: {"type":"delta","text":"## 思路"}

data: {"type":"done","usage":{"promptTokens":304,"completionTokens":141,"totalTokens":445},"model":"qwen-plus","finishReason":"stop"}
```

## 4. 失败响应（普通 JSON，非流式）

```jsonc
{ "error": { "code": "VALIDATION", "message": "输入不合法，请按提示修改" },
  "issues": [{ "path": "prompt", "message": "请先描述你的需求" }] }
```

| HTTP | code | 含义 | 能否重试 |
|---|---|---|---|
| 400 | `BAD_REQUEST` | 请求体不是合法 JSON | 否 |
| 400 | `VALIDATION` | 字段校验失败，`issues` 给出字段级原因 | 否 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体超过 64 KB | 否 |
| 429 | `RATE_LIMIT` | 触发限流，响应头带 `Retry-After`（秒） | 是（等待后） |
| 503 | `CONFIG` | 服务端缺少环境变量 | 否 |

流内 `error` 事件的 `code` 另有一组取值：`AUTH` / `QUOTA` / `TIMEOUT` / `UPSTREAM` / `INVALID_RESPONSE` / `CANCELED`，其 `retryable` 字段指示前端是否适合提供"重试"按钮。

## 5. 服务端行为

- **超时**：整体 `AI_TIMEOUT_MS`（默认 60s），超时发 `TIMEOUT` 事件。
- **重试**：仅对 `429 / 5xx / 网络错误` 重试，最多 2 次，退避 500ms、1500ms；`401 / 402` 立即失败。重试发生在首字节之前，用户不会看到重复内容。
- **限流**：按 IP 计数，默认 10 次/分钟、60 次/小时。仅对通过校验的请求计数——参数写错不消耗额度。
- **日志**：记录 `requestId / task / model / status / latencyMs / attempts / token 用量 / 输出字符数`，**不记录 Prompt 正文、模型输出正文与任何密钥**。
- **取消**：客户端断开连接后，上游请求随之中止，日志标记为 `canceled`。

## 6. 已知限制

- 限流为进程内内存计数，多实例部署时每个实例独立计数，真实上限 = 配置值 × 实例数。
- 仅实现流式模式。若后续接入不支持 SSE 的供应商，需要在 `provider.ts` 增加非流式分支，并让前端识别 `application/json` 响应。
