/**
 * Run one Razer balance sync from CLI (same path as UI Sync button).
 * Usage: node scripts/run-razer-sync.mjs [email]
 */
import pg from "pg";
import { readFileSync } from "fs";
import { createDecipheriv, createHash } from "crypto";
import { syncRazerBalanceWithPlaywright } from "../src/server/profit-razer-playwright.js";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function decryptPassword(enc, keyMaterial) {
  if (!enc) return "";
  const key = createHash("sha256").update(String(keyMaterial)).digest();
  const [ivB64, tagB64, dataB64] = String(enc).split(".");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function inferStatus(gold, silver) {
  if (gold > 0) return "ACTIVE";
  if (silver >= 5000) return "SILVER_READY";
  return "PENDING_TOPUP";
}

async function fetchOtp(env, totpKey) {
  const apiKey = env.RAZER_OTP_API_KEY;
  const base = (env.RAZER_OTP_API_URL || "https://api-system.inblackm.com/api/totp/code").split("?")[0];
  const url = `${base}?key=${encodeURIComponent(totpKey)}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  const otp = body?.data?.otp || body?.otp || "";
  if (!otp) {
    throw new Error(body?.message || `OTP API HTTP ${res.status}`);
  }
  return String(otp).trim();
}

const env = loadEnv();
const email = process.argv[2] || "inblackcad19ktb@hotmail.com";
const pool = new pg.Pool({
  host: env.PG_HOST,
  port: Number(env.PG_PORT),
  database: env.PG_DATABASE,
  user: env.PG_USER,
  password: env.PG_PASSWORD,
});

const row = (
  await pool.query(
    `SELECT id, email, zone, gold_balance, silver_balance, password_enc, totp_key, last_synced_at
     FROM profit_razer_accounts WHERE lower(email) = lower($1)`,
    [email]
  )
).rows[0];

if (!row) {
  console.error("ไม่พบบัญชี:", email);
  process.exit(1);
}

const password = decryptPassword(row.password_enc, env.GAMEDB_ENC_KEY);
if (!password) {
  console.error("บัญชีนี้ไม่มีรหัสผ่าน");
  process.exit(1);
}

const totpKey = row.totp_key || row.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "");

console.log("ก่อน sync:", {
  email: row.email,
  gold: row.gold_balance,
  silver: row.silver_balance,
  last_synced_at: row.last_synced_at,
  totp_key: totpKey,
});

console.log("ดึง OTP...");
const otp = await fetchOtp(env, totpKey);
console.log("OTP พร้อม — เริ่ม Playwright (รอ 1–2 นาที)...");

const result = await syncRazerBalanceWithPlaywright({
  email: row.email,
  password,
  otp,
  zone: row.zone,
});

const gold = Number(result.goldBalance) || 0;
const silver = Number(result.silverBalance) || 0;
const status = result.status || inferStatus(gold, silver);

await pool.query(
  `UPDATE profit_razer_accounts
   SET gold_balance = $1, silver_balance = $2, status = $3, last_synced_at = NOW(), updated_at = NOW()
   WHERE id = $4`,
  [gold, silver, status, row.id]
);

console.log("หลัง sync:", { gold, silver, status });
await pool.end();
