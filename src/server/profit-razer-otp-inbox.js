/** Fetch TOTP from api-system.inblackm.com — GET /api/totp/code?key=... + X-Api-Key: itk_... */

import { hasValidTfaSecret, normalizeTfaSecret } from "@/server/profit-razer-sync";
import { suggestTotpKeyFromEmail } from "@/server/profit-razer";

function extractReturnedAccount(data) {
  if (!data || typeof data !== "object") return null;
  const payload = data.data && typeof data.data === "object" ? data.data : data;
  const account = payload.account && typeof payload.account === "object" ? payload.account : null;
  if (!account) return null;
  return {
    lookupKey: String(account.lookup_key || account.lookupKey || "").trim().toLowerCase(),
    accountName: String(account.account_name || account.accountName || "").trim().toLowerCase(),
    label: String(account.label || "").trim(),
    id: account.id ?? null,
  };
}

function parseTotpApiResponse(data, rawText) {
  if (!data || typeof data !== "object") {
    const otp = String(rawText || "").match(/\b(\d{6})\b/)?.[1] || "";
    return { ok: Boolean(otp), otp, expiresIn: 0, error: otp ? "" : "Invalid response", account: null };
  }

  if (data.status && data.status !== "success") {
    return { ok: false, otp: "", expiresIn: 0, error: data.message || data.status, account: null };
  }

  const payload = data.data && typeof data.data === "object" ? data.data : data;
  const otp =
    payload.otp ??
    payload.totp ??
    payload.code ??
    data.otp ??
    data.code ??
    "";
  const expiresIn = Number(payload.expiresIn ?? payload.expires_in ?? 0) || 0;
  const account = extractReturnedAccount(data);

  if (!otp) {
    return { ok: false, otp: "", expiresIn: 0, error: data.message || "ไม่พบ OTP ใน response", account };
  }

  return { ok: true, otp: String(otp).trim(), expiresIn, error: "", account };
}

function extractTfaSecret(data) {
  if (!data || typeof data !== "object") return "";
  const payload = data.data && typeof data.data === "object" ? data.data : data;
  const raw =
    payload.tfaSecret ??
    payload.tfa_secret ??
    payload.secret ??
    data.tfaSecret ??
    data.secret ??
    "";
  if (raw) return normalizeTfaSecret(raw);
  const otpauth = payload.otpauth ?? payload.otpAuthUrl ?? data.otpauth ?? "";
  if (otpauth) return normalizeTfaSecret(otpauth);
  return "";
}

export function getRazerOtpInboxConfig() {
  const key = (process.env.RAZER_OTP_API_KEY || "").trim();
  const url = (process.env.RAZER_OTP_API_URL || "").trim();
  return { key, url, enabled: Boolean(key && url) };
}

function totpApiBase(urlTemplate) {
  const trimmed = (urlTemplate || "").trim().replace(/\/+$/, "");
  const noQuery = trimmed.split("?")[0];
  if (/\/api\/totp\/code$/.test(noQuery)) return noQuery;
  if (/\/api\/totp$/.test(noQuery)) return `${noQuery}/code`;
  return `${noQuery}/api/totp/code`;
}

/** Detect api-system returning the same OTP for different ?key= values. */
const recentOtpByKey = new Map();

function duplicateOtpError(requestedKey, otp) {
  const key = String(requestedKey || "").trim().toLowerCase();
  const code = String(otp || "").trim();
  if (!key || !code) return "";

  const now = Date.now();
  for (const [k, entry] of recentOtpByKey) {
    if (now - entry.at > 35_000) recentOtpByKey.delete(k);
    else if (k !== key && entry.otp === code) {
      return `OTP ซ้ำกับ key "${k}" — ใน api-system ยังใช้ Secret เดียวกัน ให้แยก Secret ต่อ key หรือใส่ 2FA Secret ใน Shield`;
    }
  }
  recentOtpByKey.set(key, { otp: code, at: now });
  return "";
}

function collectTotpKeys({ totpKey, email }) {
  const keys = [];
  const add = (v) => {
    const k = String(v || "").trim().toLowerCase();
    if (k && !keys.includes(k)) keys.push(k);
  };
  add(totpKey);
  if (!keys.length) add(suggestTotpKeyFromEmail(email));
  return keys;
}

function buildFetchTargets(urlTemplate, { totpKeys, email, emailOnly = false }) {
  const base = totpApiBase(urlTemplate);
  if (emailOnly && email) {
    const enc = encodeURIComponent(email);
    return [
      `${base}?account=${enc}`,
      `${base}?key=${enc}`,
      `${base}?label=${encodeURIComponent(`Razer — ${email}`)}`,
    ];
  }
  return [...new Set(totpKeys.map((k) => `${base}?key=${encodeURIComponent(k)}`))];
}

export function buildTotpKeyCandidates({ totpKey, email }) {
  const keys = [];
  const add = (v) => {
    const s = String(v || "").trim().toLowerCase();
    if (s && !keys.includes(s)) keys.push(s);
  };
  add(totpKey);
  add(suggestTotpKeyFromEmail(email));
  return keys;
}

/** Try to pull Base32 secret from api-system for one account (code or /secret endpoint). */
export async function fetchTotpSecretForAccount({ totpKey, email }) {
  const { key, url, enabled } = getRazerOtpInboxConfig();
  if (!enabled) {
    return { secret: "", totpKeyUsed: "", error: "ยังไม่ได้ตั้ง RAZER_OTP_API_KEY / RAZER_OTP_API_URL" };
  }

  const base = totpApiBase(url);
  const secretBase = base.replace(/\/code\/?$/i, "/secret");
  const candidates = buildTotpKeyCandidates({ totpKey, email });

  for (const k of candidates) {
    for (const target of [
      `${secretBase}?key=${encodeURIComponent(k)}`,
      `${base}?key=${encodeURIComponent(k)}`,
    ]) {
      const result = await fetchOtpOnce(target, key);
      if (result.ok && result.tfaSecret && hasValidTfaSecret(result.tfaSecret)) {
        return { secret: result.tfaSecret, totpKeyUsed: k, error: "" };
      }
    }
  }

  if (email) {
    for (const target of buildFetchTargets(url, { totpKeys: [], email, emailOnly: true })) {
      const result = await fetchOtpOnce(target, key);
      if (result.ok && result.tfaSecret && hasValidTfaSecret(result.tfaSecret)) {
        return { secret: result.tfaSecret, totpKeyUsed: email, error: "" };
      }
    }
  }

  return { secret: "", totpKeyUsed: candidates[0] || "", error: "" };
}

async function fetchOtpOnce(target, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.RAZER_OTP_API_TIMEOUT_MS || 15000));
  try {
    const res = await fetch(target, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const raw = await res.text();
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
    }

    const parsed = parseTotpApiResponse(data, raw);
    if (!res.ok && !parsed.ok) {
      const msg = parsed.error || data?.message || raw?.slice(0, 200) || `HTTP ${res.status}`;
      return { ok: false, error: msg, url: target };
    }
    if (!parsed.ok) {
      return { ok: false, error: parsed.error || `HTTP ${res.status}`, url: target };
    }

    let requestedKey = "";
    try {
      requestedKey = String(new URL(target).searchParams.get("key") || "").trim().toLowerCase();
    } catch {
      requestedKey = "";
    }
    const returned = parsed.account;
    if (
      requestedKey &&
      returned?.lookupKey &&
      returned.lookupKey !== requestedKey
    ) {
      return {
        ok: false,
        error: `api-system คืน OTP ของ key "${returned.lookupKey}" แทน "${requestedKey}" — ยังไม่มี lookup key นี้ใน TOTP (หรือ Secret ว่าง) ให้แก้ที่ 2fa.inblackm.com แล้ว Save ใหม่`,
        url: target,
      };
    }

    const tfaSecret = extractTfaSecret(data);
    return {
      ok: true,
      otp: parsed.otp,
      expiresIn: parsed.expiresIn,
      tfaSecret,
      source: "external",
      url: target,
      account: returned,
      error: "",
    };
  } catch (err) {
    const msg = err.name === "AbortError" ? "OTP API timeout" : err.message;
    return { ok: false, error: msg, url: target };
  } finally {
    clearTimeout(timer);
  }
}

function emptyExternalOtp({ otpError, totpKeyUsed = "", otpApiUrl = "" } = {}) {
  return {
    otp: "",
    tfaSecret: "",
    otpSource: "external",
    otpSecondsLeft: 0,
    otpError,
    totpKeyUsed,
    otpApiUrl,
  };
}

/** Pull TOTP code from api-system (?key= first, then ?account=email if emailOnly). */
export async function fetchRazerOtpFromExternalApi({ email, totpKey, probeKeys = [], emailOnly = false } = {}) {
  const { key, url, enabled } = getRazerOtpInboxConfig();
  if (!enabled) {
    return {
      otp: "",
      tfaSecret: "",
      otpSource: "none",
      otpSecondsLeft: 0,
      otpError: "ยังไม่ได้ตั้ง RAZER_OTP_API_KEY / RAZER_OTP_API_URL",
    };
  }

  const totpKeys = emailOnly ? [] : collectTotpKeys({ totpKey, email });
  const targets = buildFetchTargets(url, { totpKeys, email, emailOnly });

  if (!targets.length) {
    return {
      otp: "",
      tfaSecret: "",
      otpSource: "external",
      otpSecondsLeft: 0,
      otpError: "ยังไม่ได้ตั้ง TOTP Key (?key=) — ใส่ใน Shield",
    };
  }

  let lastError = "";
  for (const target of targets) {
    const result = await fetchOtpOnce(target, key);
    if (result.ok && (result.otp || result.tfaSecret)) {
      const matchedKey = (() => {
        try {
          return new URL(result.url).searchParams.get("key") || "";
        } catch {
          return "";
        }
      })();

      if (result.otp && matchedKey) {
        const dup = duplicateOtpError(matchedKey, result.otp);
        if (dup) {
          return emptyExternalOtp({ otpError: dup, totpKeyUsed: matchedKey, otpApiUrl: result.url });
        }

        const base = totpApiBase(url);
        for (const pk of probeKeys) {
          const probeKey = String(pk || "").trim().toLowerCase();
          if (!probeKey || probeKey === matchedKey.toLowerCase()) continue;
          const probe = await fetchOtpOnce(`${base}?key=${encodeURIComponent(probeKey)}`, key);
          if (probe.ok && probe.otp === result.otp) {
            return emptyExternalOtp({
              otpError: `OTP ซ้ำกับ key "${probeKey}" — ใน api-system ยังใช้ Secret เดียวกัน ให้แยก Secret ต่อ key หรือใส่ 2FA Secret ใน Shield`,
              totpKeyUsed: matchedKey,
              otpApiUrl: result.url,
            });
          }
          break;
        }
      }

      if (result.tfaSecret && hasValidTfaSecret(result.tfaSecret)) {
        return {
          otp: result.otp,
          tfaSecret: result.tfaSecret,
          otpSource: "external",
          otpSecondsLeft: result.expiresIn || 0,
          otpError: "",
          totpKeyUsed: matchedKey,
          otpApiUrl: result.url,
        };
      }

      if (result.otp) {
        return {
          otp: result.otp,
          tfaSecret: "",
          otpSource: "external",
          otpSecondsLeft: result.expiresIn || 0,
          otpError: "",
          totpKeyUsed: matchedKey,
          otpApiUrl: result.url,
        };
      }
    }
    lastError = result.error || lastError;
  }

  const hint = lastError === "Route not found"
    ? "ไม่พบ key ในระบบ TOTP — ตั้งชื่อใน URL (?key=) ที่ api-system ให้ตรงกัน"
    : lastError;

  return {
    otp: "",
    tfaSecret: "",
    otpSource: "external",
    otpSecondsLeft: 0,
    otpError: hint || "เรียก OTP API ไม่สำเร็จ",
  };
}

/** @deprecated */
export async function fetchEmailOtpForAccount(email, totpKey) {
  const result = await fetchRazerOtpFromExternalApi({ email, totpKey });
  return {
    emailOtp: result.otp,
    emailOtpSource: result.otpSource,
    emailOtpError: result.otpError,
    emailOtpAt: null,
    tfaSecret: result.tfaSecret,
  };
}
