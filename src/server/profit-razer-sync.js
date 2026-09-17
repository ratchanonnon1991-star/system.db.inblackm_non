import { createHmac } from "crypto";
import { getRazerAccount, listRazerAccounts, updateRazerAccount, suggestTotpKeyFromEmail } from "@/server/profit-razer";
import { fetchRazerOtpFromExternalApi } from "@/server/profit-razer-otp-inbox";
import { syncRazerBalanceWithPlaywright } from "@/server/profit-razer-playwright";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(input) {
  const cleaned = String(input || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of cleaned) {
    const val = BASE32.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Extract base32 secret from plain text or otpauth:// URL. */
export function normalizeTfaSecret(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const otpauthMatch = s.match(/[?&]secret=([A-Za-z2-7=]+)/i);
  if (otpauthMatch) return otpauthMatch[1].replace(/=+$/, "").toUpperCase();
  return s.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
}

export function hasValidTfaSecret(raw) {
  const normalized = normalizeTfaSecret(raw);
  if (!normalized) return false;
  return Boolean(decodeBase32(normalized).length);
}

/** Generate 6-digit TOTP from base32 secret (Google Authenticator compatible). */
export function generateTotp(secret, { step = 30, digits = 6, time = Date.now() } = {}) {
  const key = decodeBase32(normalizeTfaSecret(secret));
  if (!key.length) return "";
  const counter = Math.floor(time / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function getRazerSyncConfig() {
  const url = (process.env.RAZER_SYNC_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.RAZER_SYNC_KEY || "").trim();
  const autoSync = process.env.RAZER_AUTO_SYNC !== "false";
  const timeoutMs = Number(process.env.RAZER_SYNC_TIMEOUT_MS || 120000);
  const pollMs = Number(process.env.RAZER_BALANCE_POLL_MS || 300000);
  const useWorker = process.env.RAZER_SYNC_USE_WORKER === "1";
  return { url, key, autoSync, timeoutMs, pollMs, useWorker, enabled: true };
}

function parseBalance(raw) {
  if (raw == null || raw === "") return 0;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function inferStatus() {
  // Operational status is managed by staff / bot claim (Active, filling, …).
  // Balance sync must not rewrite those labels from Gold/Silver.
  return "ACTIVE";
}

/**
 * Fetch Gold/Silver — Playwright inline by default; optional external worker.
 */
export async function fetchRazerBalance(credentials) {
  const { url, key, timeoutMs, useWorker } = getRazerSyncConfig();
  let otp = credentials.otp || "";
  if (!otp && credentials.tfaSecret) otp = generateTotp(credentials.tfaSecret);

  if (useWorker && url) {
    try {
      return await fetchRazerBalanceViaWorker(credentials, { url, key, timeoutMs, otp });
    } catch (err) {
      console.warn("Razer worker sync failed, falling back to inline Playwright:", err.message);
    }
  }

  const result = await syncRazerBalanceWithPlaywright({
    email: credentials.email,
    password: credentials.password,
    otp,
    zone: credentials.zone,
  });
  return {
    goldBalance: parseBalance(result.goldBalance),
    silverBalance: parseBalance(result.silverBalance),
    status: result.status || inferStatus(result),
    raw: result,
  };
}

/** @deprecated alias */
export async function fetchRazerBalanceRemote(credentials) {
  return fetchRazerBalance(credentials);
}

async function fetchRazerBalanceViaWorker(credentials, { url, key, timeoutMs, otp }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        tfaSecret: credentials.tfaSecret,
        totpKey: credentials.totpKey,
        zone: credentials.zone,
        otp,
      }),
      signal: controller.signal,
    });

    const body = await res.text();
    let data = null;
    if (body) {
      try {
        data = JSON.parse(body);
      } catch {
        throw Object.assign(new Error("Sync worker ตอบกลับไม่ใช่ JSON"), { status: 502 });
      }
    }

    if (!res.ok) {
      throw Object.assign(new Error(data?.error || data?.message || `Sync worker error (${res.status})`), {
        status: res.status >= 500 ? 502 : 400,
      });
    }

    const payload = data?.data && typeof data.data === "object" ? data.data : data;
    const goldBalance = parseBalance(payload?.goldBalance ?? payload?.gold ?? payload?.gold_balance);
    const silverBalance = parseBalance(payload?.silverBalance ?? payload?.silver ?? payload?.silver_balance);
    const status = payload?.status || inferStatus({ goldBalance, silverBalance });

    return { goldBalance, silverBalance, status, raw: data };
  } catch (err) {
    if (err.name === "AbortError") {
      throw Object.assign(new Error("Sync worker ใช้เวลานานเกินไป"), { status: 504 });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncRazerAccountById(id) {
  const account = await getRazerAccount(id, { includeSecrets: true });
  if (!account) throw Object.assign(new Error("ไม่พบบัญชี"), { status: 404 });
  if (!account.password && !account.hasPassword) {
    throw Object.assign(new Error("บัญชีนี้ไม่มีรหัสผ่าน — sync ไม่ได้"), { status: 400 });
  }

  let otp = account.tfaSecret ? generateTotp(account.tfaSecret) : "";
  if (!otp) {
    const external = await fetchRazerOtpFromExternalApi({
      email: account.email,
      totpKey: account.totpKey || suggestTotpKeyFromEmail(account.email),
    });
    otp = external.otp || "";
    if (!otp && external.otpError) {
      throw Object.assign(
        new Error(`OTP ไม่พร้อม — ตั้ง key "${account.totpKey || suggestTotpKeyFromEmail(account.email)}" + Secret ใน api-system ก่อน (${external.otpError})`),
        { status: 400 }
      );
    }
  }

  const remote = await fetchRazerBalance({
    email: account.email,
    password: account.password,
    tfaSecret: account.tfaSecret,
    totpKey: account.totpKey || suggestTotpKeyFromEmail(account.email),
    zone: account.zone,
    otp,
  });

  const updated = await updateRazerAccount(id, {
    goldBalance: remote.goldBalance,
    silverBalance: remote.silverBalance,
    // Keep staff/bot operational status (Active / filling / dropped / disabled).
    syncBalance: true,
  });

  return { account: updated, remote };
}

/**
 * Guard against overlapping full syncs. Every open browser tab polls this
 * endpoint on a timer; when a run outlasts the poll interval the runs stack
 * and each one spawns its own Chromium fleet. Concurrent callers now join the
 * run already in flight instead of starting another.
 */
const inFlightSyncAll = new Map();

export async function syncAllRazerAccounts({ zone } = {}) {
  const key = zone || "*";
  const running = inFlightSyncAll.get(key);
  if (running) return running;

  const promise = runSyncAllRazerAccounts({ zone }).finally(() => {
    inFlightSyncAll.delete(key);
  });
  inFlightSyncAll.set(key, promise);
  return promise;
}

async function runSyncAllRazerAccounts({ zone } = {}) {
  const accounts = await listRazerAccounts({ zone });
  const results = { ok: 0, failed: 0, errors: [] };
  const concurrency = Math.max(1, Number(process.env.RAZER_SYNC_CONCURRENCY || 3));

  async function syncOne(account) {
    if (!account.hasPassword) {
      results.failed += 1;
      results.errors.push({ id: account.id, email: account.email, message: "ไม่มีรหัสผ่าน" });
      return;
    }
    try {
      await syncRazerAccountById(account.id);
      results.ok += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push({ id: account.id, email: account.email, message: err.message });
    }
  }

  const queue = [...accounts];
  async function worker() {
    let account;
    while ((account = queue.shift())) {
      await syncOne(account);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, accounts.length) }, worker));

  return results;
}

export async function maybeAutoSyncRazerAccount(id) {
  const { autoSync, enabled } = getRazerSyncConfig();
  if (!autoSync || !enabled) return null;
  try {
    return await syncRazerAccountById(id);
  } catch (err) {
    console.error(`Razer auto-sync failed for ${id}:`, err.message);
    return null;
  }
}
