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

### 会话绑定 `conversationId`（四个接口均支持，可选）

```jsonc
{
  "prompt": "把它改成支持 async/await",
  "language": "typescript",
  "conversationId": "d6c89d9a-2b04-4c93-a2c3-c128966929ef"
}
```

- **带上它**：服务端从数据库读取该会话的历史消息、写入本轮用户消息与助手回答。
- **不带或为 null**：视为新会话，由服务端创建并在 `meta.conversationId` 中返回。
- 会话不存在时返回 `404 NOT_FOUND`，不会静默创建新会话——否则用户会以为在续写，实际开了新对话。

> 早期版本由客户端上传 `history` 数组。接入数据库后该字段已移除：历史必须是服务端可核验的，不能由客户端声明。

### 上下文裁剪规则（服务端强制）

| 规则 | 值 |
|---|---|
| 最多保留历史条数 | 10 条（最近的） |
| 单条最大字符 | 4000（超出截断并补 `…`） |
| 历史总字符预算 | 24000（超预算从最旧开始丢弃） |

发生任何裁剪时，`meta.context.truncated` 为 `true`，客户端应提示用户「早期内容未参与本轮」。

`language` 取值：`typescript | javascript | python | java | go | sql | html-css | other`
`goals` 取值：`naming | split | dedupe | readability | performance`，至少一项。

## 3. 成功响应（`text/event-stream`）

每行一个事件，格式为 `data: {json}\n\n`。

| 事件 | 载荷 | 说明 |
|---|---|---|
| `meta` | `{ requestId, task, model, conversationId, context: { messages, truncated } }` | 流开始；`conversationId` 为本次使用的会话（新会话时由服务端创建） |
| `delta` | `{ text }` | 增量文本，直接追加渲染 |
| `done` | `{ usage, model, finishReason }` | 结束；`usage` 为真实 token 用量，可能为 `null` |
| `error` | `{ error: { code, message, retryable } }` | 出错；之后流即结束 |

示例：

```
data: {"type":"meta","requestId":"...","task":"generate","model":"qwen-plus","conversationId":"d6c89d9a-...","context":{"messages":4,"truncated":false}}

data: {"type":"delta","text":"## 思路"}

data: {"type":"done","usage":{"promptTokens":304,"completionTokens":141,"totalTokens":445},"model":"qwen-plus","finishReason":"stop"}
```

## 3.5 会话接口

| 方法 + 路径 | 说明 | 关键约束 |
|---|---|---|
| `GET /api/conversations?limit=20` | 会话列表，按 `last_message_at` 倒序 | limit 1–50 |
| `POST /api/conversations` | 新建会话 `{ taskType, language, title? }` | 返回 201 |
| `GET /api/conversations/[id]` | 单个会话 | 不存在 → 404 |
| `PATCH /api/conversations/[id]` | 重命名 `{ title }` | 1–60 字，空标题 → 400 |
| `DELETE /api/conversations/[id]` | 删除会话（消息级联删除） | 204 |
| `GET /api/conversations/[id]/messages` | 会话 + 全部消息（按 seq 升序） | 不存在 → 404 |

数据库错误对外统一返回 `500 DB_ERROR` 与中性文案，原始 PostgREST 信息只进服务端日志。

## 3.6 片段接口

| 方法 + 路径 | 说明 | 关键约束 |
|---|---|---|
| `GET /api/snippets?q=&language=&limit=` | 片段列表，按创建时间倒序 | `q` ≤60 字；`limit` 1–100 |
| `POST /api/snippets` | 新建 `{ title, language, code, description?, sourceMessageId? }` | 标题 1–100；代码 1–20000 |
| `GET /api/snippets/[id]` | 单个片段 | 不存在 → 404 |
| `PATCH /api/snippets/[id]` | 部分更新 | 至少一个字段，空对象 → 400 |
| `DELETE /api/snippets/[id]` | 删除 | 204 |

搜索同时匹配 `title` 与 `code`（`ilike`，大小写不敏感）。查询词会在服务端剔除 `, ( ) % _ \`：前三个会破坏 PostgREST `or()` 的条件分隔，后两个是 LIKE 通配符，用户输入应被当作字面量。

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
- 上下文裁剪按**字符数**而非 token 数估算。中文与代码的 token 密度差异较大，24000 字符对应的 token 数在 8k–20k 之间波动，因此它是"成本护栏"而不是精确预算。
- 历史消息由客户端提供，服务端不做完整性校验（无法验证 assistant 消息是否真由本服务生成）。接入用户认证与数据库后，历史应从数据库读取。
