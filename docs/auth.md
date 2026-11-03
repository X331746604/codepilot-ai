# 认证与数据隔离

## 1. 方案

Supabase Auth（邮箱 + 密码）+ `@supabase/ssr` 的 cookie 会话。

选它而不是自己写 JWT，是因为这个项目的数据库本来就在 Supabase：认证和数据库在同一个服务里，`auth.uid()` 能直接在 RLS 策略中使用。自己签 JWT 还要额外维护一整套密钥与刷新逻辑，收益为零。

| 关注点 | 做法 |
|---|---|
| 登录态 | 存在 HttpOnly cookie 里，由 `@supabase/ssr` 读写 |
| 服务端验身份 | `supabase.auth.getUser()`，会真正向 auth 服务校验 token |
| 业务数据访问 | 一律用**用户态客户端**（access token + publishable key），受 RLS 约束 |
| 管理操作 | 只在大脚本里用 secret key，请求路径永不触碰 |

## 2. 两把钥匙的边界

| 变量 | 前缀 | 能做什么 | 出现在哪 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 公开 | 受 RLS 限制的读写 | 浏览器 + 服务端 |
| `SUPABASE_SECRET_KEY` | 绝密 | **绕过所有 RLS** | 只在脚本、`e2e/helpers/user.ts` |

关键设计：请求路径上**没有任何地方**使用 secret key。即使某个仓储函数忘了写 owner 过滤，数据库也不会返回别人的行——这一层不依赖代码正确性。

## 3. RLS 策略

三张业务表各四条策略，全部是 `owner_id = auth.uid()`：

```sql
create policy conversations_select_own on public.conversations
  for select using (owner_id = auth.uid());
```

`messages` 的 insert 额外多一个条件：

```sql
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.conversations c
     where c.id = conversation_id and c.owner_id = auth.uid()
  )
);
```

**为什么需要它**：`owner_id` 有 `default auth.uid()`，用户可以把自己的消息插到**别人的会话**下——外键只保证会话存在，不保证属于你。这条 `exists` 才是真正的边界。

`profiles` 只有 select / update 两条策略，**刻意不建 insert 与 delete**：
建档由注册触发器（`security definer`）完成，删号随 `auth.users` 级联。客户端没有 insert 权限，也就无法伪造别人的资料。

## 4. 三层守卫

```
proxy.ts          → 只看有没有会话 cookie，没有就跳 /login（乐观、无网络开销）
页面 requireSession → 调 auth.getUser() 验证 token，失败跳 /login
接口 authenticate   → 同样验证，失败返回 401 JSON
```

Next 的文档明确说 proxy 不该作为授权边界，所以它只做第一层过滤；真正判定在页面与接口。伪造一个 cookie 能过 proxy，但过不了 `getUser()`。

## 5. 越权返回 404 而不是 403

`GET /api/conversations/{别人家的 id}` 返回 404。403 等于告诉对方"这个 ID 存在，只是不属于你"，本身就是信息泄露。RLS 让查询直接查不到那一行，代码自然落到"不存在"分支——既安全又不需要额外判断。

## 6. 默认语言为什么在数据库

需求文档 FR-9.2 把偏好分成两类：

| 类型 | 例子 | 存哪 | 为什么 |
|---|---|---|---|
| 业务偏好 | 默认语言 | `profiles` 表 | 影响"生成什么代码"，换台电脑必须还在 |
| 本机偏好 | 主题、温度、流式开关 | `localStorage` | 个人手感，跟着浏览器走更自然 |

所以设置页分成「账号」与「默认值」两块，前者走 `PATCH /api/profile`，后者走本地存储。

## 7. 本地验证用的账号

项目的 Auth 默认开启「Confirm email」（`mailer_autoconfirm: false`），走注册流程必须点邮件里的链接才能激活。自动化测试用 Admin API 建「已确认」的账号：

```http
POST {SUPABASE_URL}/auth/v1/admin/users
{ "email": "e2e-a@codepilot.local", "password": "…", "email_confirm": true }
```

这不是绕过认证：测试走的仍然是真实的登录接口与会话 cookie，只是省掉收邮件这一步。

两个账号：`e2e-a@codepilot.local`（主账号）与 `e2e-b@codepilot.local`（越权验证用），密码见 `e2e/helpers/user.ts`，可用环境变量覆盖。

## 8. 已知限制

1. **没有找回密码**：个人项目没接邮件通道，忘记密码只能在 Supabase 后台重置。登录页已如实标注。
2. **注册需要邮箱确认**：真实注册会卡在"点击邮件链接"这一步。若要做公开演示，可在 Supabase → Authentication → Providers → Email 关掉 Confirm email，但那样任何人都能注册。
3. **proxy 只做乐观检查**：token 过期后，用户在页面上的操作会在下一次接口调用时收到 401，需要刷新页面重新登录——没有做"静默刷新后自动重试"。
4. **限流仍按 IP**：不按用户。同一出口 IP 的多个账号共享额度。
5. **没有邮箱变更、头像、多设备管理**：属于资料页的后续功能。
