/**
 * 密钥泄露扫描（AC-19）。
 *
 * 扫两类东西：
 * 1. Git 已跟踪的文件——防止密钥被提交进仓库；
 * 2. 构建产物 `.next/static` 与 `.next/server`——防止服务端变量被打进客户端包。
 *
 * 判定依据有两条，互为补充：
 * - **已知值比对**：直接拿 `.env.local` 里的真实值去搜，命中即泄露；
 * - **形态匹配**：`sk-*` / `sb_secret_*` / JWT，防止别的项目的密钥被误提交。
 *
 * 用法：pnpm scan:secrets
 * 退出码非 0 表示发现疑似泄露。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MAX_BYTES = 2 * 1024 * 1024;
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf",
  ".mp4", ".zip", ".pdf", ".wasm",
]);

const PATTERNS = [
  { name: "DashScope / OpenAI 风格密钥", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Supabase secret key", regex: /\bsb_secret_[A-Za-z0-9_-]{16,}\b/g },
  {
    name: "JWT（可能是 service_role 或 anon key）",
    regex: /\beyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
];

/** 文档与示例文件里的占位符不算泄露 */
const PLACEHOLDER = /your[-_]|xxx|placeholder|example|redacted|dummy|fake/i;

/** 只有这些变量算秘密；URL 与 publishable key 本来就是给浏览器用的 */
const SECRET_KEY_PATTERN = /(SECRET|SERVICE_ROLE|API_KEY|PASSWORD|ACCESS_TOKEN)/i;

function readEnvValues() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return [];

  const values = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const at = line.indexOf("=");
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (!SECRET_KEY_PATTERN.test(key)) continue;
    // 太短的值会在任何文件里误命中（例如 "true"），只比对像密钥的
    if (value.length >= 16) values.push({ key, value });
  }
  return values;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // 缓存里是第三方包的压缩包，扫它没有意义
      if (entry.name === "cache") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function collectFiles() {
  const files = [];

  // 1. Git 跟踪的文件
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  for (const rel of tracked) files.push({ path: join(root, rel), label: rel });

  // 2. 构建产物
  for (const dir of [".next/static", ".next/server"]) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs)) {
      files.push({ path: file, label: relative(root, file).replace(/\\/g, "/") });
    }
  }

  return files;
}

function scan() {
  const envValues = readEnvValues();
  const files = collectFiles();

  const findings = [];
  let scanned = 0;
  let skipped = 0;

  for (const { path, label } of files) {
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_BYTES) {
      skipped += 1;
      continue;
    }
    if (BINARY_EXT.has(extname(path).toLowerCase())) {
      skipped += 1;
      continue;
    }

    let content;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      skipped += 1;
      continue;
    }
    // 含 NUL 的按二进制处理
    if (content.includes("\0")) {
      skipped += 1;
      continue;
    }

    scanned += 1;

    for (const { key, value } of envValues) {
      if (content.includes(value)) {
        findings.push({ file: label, rule: `环境变量 ${key} 的真实值` });
      }
    }

    for (const { name, regex } of PATTERNS) {
      regex.lastIndex = 0;
      for (const match of content.matchAll(regex)) {
        if (PLACEHOLDER.test(match[0])) continue;
        const line = content.slice(0, match.index).split("\n").length;
        findings.push({ file: `${label}:${line}`, rule: name });
      }
    }
  }

  console.log(`扫描 ${scanned} 个文件（跳过 ${skipped} 个二进制/超大文件）`);
  console.log(`已知密钥值 ${envValues.length} 条，形态规则 ${PATTERNS.length} 条`);

  if (findings.length === 0) {
    console.log("未发现密钥泄露");
    return true;
  }

  console.log(`\n发现 ${findings.length} 处疑似泄露：`);
  for (const item of findings) console.log(`  ${item.file}  ← ${item.rule}`);
  return false;
}

if (!scan()) process.exit(1);
