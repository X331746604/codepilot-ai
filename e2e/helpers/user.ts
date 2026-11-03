/**
 * e2e 账号准备。
 *
 * 项目的 Auth 默认开启「Confirm email」，走注册流程要收邮件才能激活。
 * 测试里用 Admin API 直接建「已确认」的账号，跳过邮件环节——
 * 这不是绕过认证，测的仍然是真实的登录接口与会话 cookie。
 */

import { readFileSync } from "node:fs";

const ROOT = "C:/Users/asus/WorkBuddy/2026-10-28-21-14-03";

export const TEST_USER = {
  email: process.env.E2E_EMAIL ?? "e2e-a@codepilot.local",
  password: process.env.E2E_PASSWORD ?? "e2e-password-123",
};

export const OTHER_USER = {
  email: process.env.E2E_EMAIL_B ?? "e2e-b@codepilot.local",
  password: process.env.E2E_PASSWORD_B ?? "e2e-password-456",
};

function readEnv() {
  const raw = readFileSync(`${ROOT}/.env.local`, "utf8");
  const map: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const at = line.indexOf("=");
    map[line.slice(0, at)] = line.slice(at + 1);
  }
  return map;
}

/** 浏览器可用的配置，用于绕过应用直接验证 RLS。 */
export function publicConfig() {
  const env = readEnv();
  return {
    url: (env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? "").replace(/\/+$/, ""),
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}

export function supabaseAdmin() {
  const env = readEnv();
  const url = (env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SECRET_KEY，无法创建测试账号");

  return {
    url,
    key,
    async createUser(email: string, password: string): Promise<string> {
      const response = await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });

      if (response.ok) {
        const body = (await response.json()) as { id: string };
        return body.id;
      }

      const detail = await response.text();

      // 已经存在就查出来复用，保证用例可重复执行
      if (response.status === 422 || detail.includes("already")) {
        const list = await fetch(
          `${url}/auth/v1/admin/users?page=1&per_page=200`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        if (list.ok) {
          const body = (await list.json()) as { users?: Array<{ id: string; email?: string }> };
          const found = body.users?.find((user) => user.email === email);
          if (found) return found.id;
        }
      }

      throw new Error(`创建测试账号失败：HTTP ${response.status} ${detail.slice(0, 200)}`);
    },

    /** 把账号密码重置成已知值，避免上一次跑测试改过密码 */
    async resetPassword(userId: string, password: string) {
      await fetch(`${url}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password, email_confirm: true }),
      });
    },
  };
}
