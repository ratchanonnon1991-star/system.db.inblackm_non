/**
 * ทดสอบ Bot API จริง — ใช้ key จาก DB หรือ RAZER_BOT_API_KEY ใน .env
 * node scripts/test-razer-bot-api.mjs [baseUrl]
 */
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || "http://localhost:4183").replace(/\/+$/, "");

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* ignore */ }
}

loadEnv();

async function getBotKey() {
  const envKey = (process.env.RAZER_BOT_API_KEY || "").trim();
  if (envKey) return { key: envKey, source: "env" };

  const pool = new pg.Pool({
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || "inblackm_system",
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgres",
  });
  try {
    const { rows } = await pool.query(
      `SELECT enabled, api_key_prefix FROM profit_razer_bot_settings WHERE id = 1`
    );
    const row = rows[0];
    if (!row?.enabled) {
      console.log("⚠ Bot API ใน DB: enabled =", row?.enabled ?? "ไม่มี row");
      console.log("  → เปิด Bot API ในหน้า Razer Stock > Developer API หรือตั้ง RAZER_BOT_API_KEY ใน .env");
      return { key: "", source: "none", prefix: row?.api_key_prefix };
    }
    console.log("⚠ มี key ใน DB (prefix:", row.api_key_prefix, ") แต่ hash ไม่ reverse ได้");
    console.log("  → ใส่ RAZER_BOT_API_KEY ใน .env หรือ regenerate แล้ว copy key");
    return { key: "", source: "db-hash", prefix: row.api_key_prefix };
  } finally {
    await pool.end();
  }
}

async function api(path, key, options = {}) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log("=== Razer Bot API Test ===");
  console.log("Base:", base);

  const { key, source, prefix } = await getBotKey();
  if (!key) {
    console.log("\n❌ ไม่มี Bot API key ที่ใช้ทดสอบได้");
    if (prefix) console.log("   Key prefix ใน DB:", prefix);
    process.exit(1);
  }
  console.log("Key source:", source, `(${key.slice(0, 20)}…)`);

  // 1) Health
  const health = await api("/api/profit/razer/bot/health", key);
  console.log("\n1) GET /bot/health →", health.status, health.data);
  if (!health.data?.ok) {
    console.log("❌ Health check ไม่ผ่าน");
    process.exit(1);
  }
  console.log("✓ Health OK");

  // 2) List accounts
  const list = await api("/api/profit/razer/bot/accounts?zone=CAD", key);
  console.log("\n2) GET /bot/accounts →", list.status, "count:", list.data?.count);
  const accounts = list.data?.accounts || [];
  if (!accounts.length) {
    console.log("⚠ ไม่มีบัญชี botEnabled — เปิด Bot API ON ในตาราง");
    process.exit(0);
  }
  for (const a of accounts.slice(0, 3)) {
    console.log(`   - ${a.email} | gold=${a.goldBalance} | status=${a.status} | otp=${a.otp || "(none)"}`);
  }

  // 3) OTP endpoint
  const first = accounts[0];
  const otpRes = await api(`/api/profit/razer/bot/otp?email=${encodeURIComponent(first.email)}`, key);
  console.log("\n3) GET /bot/otp?email=... →", otpRes.status);
  const otpBundle = otpRes.data?.otp || otpRes.data;
  console.log(`   OTP: ${otpBundle?.otp || otpBundle?.totp || "—"} (${otpBundle?.otpSource || "?"}) key=${otpBundle?.totpKeyUsed || first.totpKey}`);

  // 4) Use (dry run — จะ mark IN_USE, release ทันที)
  const useRes = await api(`/api/profit/razer/bot/accounts/${first.id}/use`, key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ botName: "test-script", orderId: `test-${Date.now()}` }),
  });
  console.log("\n4) POST /bot/accounts/{id}/use →", useRes.status);
  if (useRes.ok) {
    console.log(`   email=${useRes.data?.email} otp=${useRes.data?.otp || useRes.data?.totp} password=${useRes.data?.password ? "***" : "—"}`);
    const rel = await api(`/api/profit/razer/bot/accounts/${first.id}/release`, key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    console.log("   release →", rel.status, rel.data?.account?.status);
  } else {
    console.log("   error:", useRes.data?.error || useRes.data);
  }

  console.log("\n✓ Bot API พร้อมให้เพื่อนใช้");
  console.log(`   URL: ${base}/api/profit/razer/bot/accounts`);
  console.log(`   Header: Authorization: Bearer ${key.slice(0, 16)}…`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
