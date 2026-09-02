/**
 * Razer balance sync worker — standalone (Playwright built-in).
 *   npm run razer-sync-worker
 *
 * Mock (dev only): RAZER_SYNC_MOCK=1
 */
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  generateTotp,
  normalizeTfaSecret,
  syncRazerBalanceWithPlaywright,
} from "./lib/razer-balance-scraper.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const envPath = resolve(__dirname, "../.env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv();

const PORT = Number(process.env.RAZER_SYNC_WORKER_PORT || 5590);
const MOCK = process.env.RAZER_SYNC_MOCK === "1";

function suggestTotpKey(email) {
  return String(email || "").split("@")[0]?.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "";
}

function totpApiBase(urlTemplate) {
  const trimmed = (urlTemplate || "").trim().replace(/\/+$/, "");
  if (trimmed.includes("/api/totp/code")) return trimmed.split("?")[0];
  return `${trimmed}/api/totp/code`;
}

async function fetchOtpFromApi({ totpKey, email }) {
  const apiKey = (process.env.RAZER_OTP_API_KEY || "").trim();
  const urlTemplate = (process.env.RAZER_OTP_API_URL || "").trim();
  if (!apiKey || !urlTemplate) return "";

  const keys = [...new Set([totpKey, suggestTotpKey(email)].filter(Boolean))];
  const base = totpApiBase(urlTemplate);

  for (const k of keys) {
    const target = `${base}?key=${encodeURIComponent(k)}`;
    try {
      const res = await fetch(target, {
        headers: { "X-Api-Key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(Number(process.env.RAZER_OTP_API_TIMEOUT_MS || 15000)),
      });
      const data = await res.json().catch(() => null);
      const otp = data?.data?.otp ?? data?.otp ?? "";
      if (otp) return String(otp).trim();
    } catch {
      /* try next key */
    }
  }
  return "";
}

async function resolveOtp({ otp, tfaSecret, totpKey, email }) {
  if (otp) return String(otp).trim();
  const secret = normalizeTfaSecret(tfaSecret);
  if (secret) return generateTotp(secret);
  return fetchOtpFromApi({ totpKey: totpKey || suggestTotpKey(email), email });
}

async function handleSync(body) {
  const { email, password, tfaSecret, totpKey, zone, otp } = body || {};
  if (!email || !password) {
    throw Object.assign(new Error("email และ password จำเป็น"), { status: 400 });
  }

  if (MOCK) {
    const seed = [...String(email)].reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      goldBalance: Math.round((seed % 500) / 10 + 0.25) / 1,
      silverBalance: (seed % 9000) + 100,
      status: seed % 3 === 0 ? "SILVER_READY" : "ACTIVE",
      message: "mock",
    };
  }

  const resolvedOtp = await resolveOtp({ otp, tfaSecret, totpKey, email });
  return syncRazerBalanceWithPlaywright({ email, password, otp: resolvedOtp, zone });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, mock: MOCK, mode: MOCK ? "mock" : "playwright" }));
    return;
  }

  if (req.method === "POST" && req.url === "/sync") {
    try {
      const body = await readJson(req);
      const result = await handleSync(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(err.status || 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} ถูกใช้อยู่แล้ว — รัน: npm run razer-sync-worker:restart`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Razer sync worker http://127.0.0.1:${PORT}/sync (mode=${MOCK ? "mock" : "playwright"})`);
});
