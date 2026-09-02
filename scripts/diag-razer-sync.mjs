import pg from "pg";
import { readFileSync } from "fs";
import { createDecipheriv, createHash } from "crypto";

function loadEnv() {
  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
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

const env = loadEnv();
const pool = new pg.Pool({
  host: env.PG_HOST,
  port: env.PG_PORT,
  database: env.PG_DATABASE,
  user: env.PG_USER,
  password: env.PG_PASSWORD,
});

const email = process.argv[2] || "inblackcad19ktb@hotmail.com";
const row = (
  await pool.query(
    `SELECT id, email, zone, gold_balance, silver_balance, password_enc, tfa_secret, totp_key, last_synced_at
     FROM profit_razer_accounts WHERE lower(email) = lower($1)`,
    [email]
  )
).rows[0];

if (!row) {
  console.log(JSON.stringify({ error: "account_not_found" }, null, 2));
  process.exit(1);
}

const totpKey = row.totp_key || row.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "");
const hasPassword = Boolean(decryptPassword(row.password_enc, env.GAMEDB_ENC_KEY));

console.log(JSON.stringify({
  account: {
    id: row.id,
    email: row.email,
    gold_balance: row.gold_balance,
    silver_balance: row.silver_balance,
    last_synced_at: row.last_synced_at,
    totp_key: totpKey,
    has_password: hasPassword,
    has_tfa: Boolean(row.tfa_secret),
  },
}, null, 2));

// OTP test
const apiKey = env.RAZER_OTP_API_KEY;
const otpUrl = `${env.RAZER_OTP_API_URL?.split("?")[0] || "https://api-system.inblackm.com/api/totp/code"}?key=${encodeURIComponent(totpKey)}`;
try {
  const otpRes = await fetch(otpUrl, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
  });
  const otpBody = await otpRes.json().catch(() => ({}));
  console.log(JSON.stringify({
    otp_test: {
      http: otpRes.status,
      ok: otpRes.ok,
      has_otp: Boolean(otpBody?.data?.otp || otpBody?.otp),
      message: otpBody?.message || otpBody?.status || "",
    },
  }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ otp_test: { error: e.message } }, null, 2));
}

// Playwright test
try {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  await browser.close();
  console.log(JSON.stringify({ playwright: { ok: true } }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ playwright: { ok: false, error: e.message } }, null, 2));
}

await pool.end();
