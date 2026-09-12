/**
 * ไล่ทดสอบ OTP ต่อ key — ไม่พิมพ์รหัส OTP จริง
 * node scripts/diag-razer-otp-keys.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const accounts = [
  { email: "chipmunksgd04@hotmail.com", key: "chipmunksgd04" },
  { email: "robertoohsgd05@hotmail.com", key: "robertoohsgd05" },
  { email: "weunwuzz03@hotmail.com", key: "weunwuzz03" },
];

async function probeKey(key) {
  const apiKey = (process.env.RAZER_OTP_API_KEY || "").trim();
  const urlTemplate = (process.env.RAZER_OTP_API_URL || "").trim();
  const base = urlTemplate.split("?")[0].replace(/\/+$/, "");
  const target = `${base}?key=${encodeURIComponent(key)}`;

  const res = await fetch(target, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
  });
  const raw = await res.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  const payload = data?.data && typeof data.data === "object" ? data.data : data;
  const otp = String(payload?.otp ?? payload?.code ?? data?.otp ?? "").trim();
  const account = payload?.account || data?.account || null;
  const lookupKey = String(account?.lookup_key || account?.lookupKey || "").trim();
  const returnedEmail = String(account?.account_name || account?.accountName || account?.label || "").trim();

  let err = "";
  if (data?.status && data.status !== "success") err = data.message || data.status;
  else if (!/^\d{6}$/.test(otp)) err = data?.message || raw.slice(0, 160) || `HTTP ${res.status}`;

  return {
    http: res.status,
    hasOtp: /^\d{6}$/.test(otp),
    lookupKey,
    returnedEmail,
    err,
    requestedKey: key,
  };
}

async function main() {
  const pool = new pg.Pool({
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || "inblackm_system",
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgres",
  });

  const emails = accounts.map((a) => a.email.toLowerCase());
  const { rows } = await pool.query(
    `SELECT id, email, totp_key,
            (tfa_secret IS NOT NULL AND length(btrim(tfa_secret)) > 0) AS has_tfa
     FROM profit_razer_accounts
     WHERE lower(email) = ANY($1::text[])`,
    [emails]
  );
  await pool.end();

  console.log("=== api-system (OTP ไม่แสดง — แค่สถานะ) ===\n");
  const otps = [];
  for (const a of accounts) {
    const r = await probeKey(a.key);
    if (r.hasOtp) otps.push({ key: a.key, masked: "******" });
    console.log(`${a.email}`);
    console.log(`  key ขอ: ${a.key}`);
    console.log(`  HTTP: ${r.http} | มี OTP: ${r.hasOtp ? "ใช่" : "ไม่"}`);
    if (r.lookupKey) console.log(`  api-system คืน lookup_key: ${r.lookupKey}`);
    if (r.returnedEmail) console.log(`  api-system account: ${r.returnedEmail}`);
    if (r.err && !r.hasOtp) console.log(`  error: ${r.err}`);
    console.log("");
  }

  // duplicate check
  if (otps.length >= 2) {
    console.log("=== ตรวจ OTP ซ้ำข้าม key ===");
    const codes = new Map();
    for (const a of accounts) {
      const apiKey = (process.env.RAZER_OTP_API_KEY || "").trim();
      const urlTemplate = (process.env.RAZER_OTP_API_URL || "").trim();
      const base = urlTemplate.split("?")[0].replace(/\/+$/, "");
      const res = await fetch(`${base}?key=${encodeURIComponent(a.key)}`, {
        headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      const payload = data?.data && typeof data.data === "object" ? data.data : data;
      const otp = String(payload?.otp ?? payload?.code ?? "").trim();
      if (/^\d{6}$/.test(otp)) {
        const prev = codes.get(otp);
        if (prev) console.log(`  ซ้ำ: ${a.key} กับ ${prev}`);
        else codes.set(otp, a.key);
      }
    }
    if (codes.size === accounts.length) console.log("  ไม่พบ OTP ซ้ำกัน ✓");
    console.log("");
  }

  console.log("=== DB (Shield) ===\n");
  for (const a of accounts) {
    const db = rows.find((r) => r.email.toLowerCase() === a.email.toLowerCase());
    console.log(`${a.email}`);
    if (!db) {
      console.log("  ไม่พบใน DB — ต้อง import/add บัญชีก่อน");
    } else {
      console.log(`  id: ${db.id}`);
      console.log(`  totp_key ใน DB: ${db.totp_key || "(ว่าง)"}`);
      console.log(`  มี tfa_secret ใน DB: ${db.has_tfa ? "ใช่" : "ไม่"}`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
