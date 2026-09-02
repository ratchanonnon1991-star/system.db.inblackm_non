/**
 * Login Razer ID + scrape Gold/Silver.
 * Copied from Inblack_Project/api/app/services/razerGoldBalanceService.js
 */
import { createHmac } from "crypto";

const LOGIN_URL =
  process.env.RAZER_LOGIN_URL ||
  "https://razerid.razer.com/?client_id=63c74d17e027dc11f642146bfeeaee09c3ce23d8&redirect=https%3A%2F%2Fgold.razer.com%2Faccount%2Flogin";

const PROFILE_URLS = [
  "https://razerid.razer.com/",
  "https://gold.razer.com/global/en/gold/account-summary",
  "https://gold.razer.com/global/en/gold/reload",
];

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseNumber(raw) {
  if (raw == null || raw === "") return 0;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function inferStatus(goldBalance, silverBalance) {
  if (goldBalance > 0) return "ACTIVE";
  if (silverBalance >= 5000) return "SILVER_READY";
  return "PENDING_TOPUP";
}

function parseBalancesFromApi(json) {
  if (!json || typeof json !== "object") return null;
  const gold =
    json.goldBalance ?? json.gold_balance ?? json.gold
    ?? json.wallet?.gold ?? json.wallet?.goldBalance
    ?? json.data?.goldBalance ?? json.data?.gold;
  const silver =
    json.silverBalance ?? json.silver_balance ?? json.silver
    ?? json.wallet?.silver ?? json.wallet?.silverBalance
    ?? json.data?.silverBalance ?? json.data?.silver;
  if (gold == null && silver == null) return null;
  const goldBalance = parseNumber(gold);
  const silverBalance = parseNumber(silver);
  return { goldBalance, silverBalance, status: inferStatus(goldBalance, silverBalance) };
}

// Rewards page shows the main balance *above* the "Razer Silver" label; the
// "12,365 expiring on …" line is a sub-amount — old parser grabbed that.
function parseSilverBalance(text) {
  const body = String(text || "").replace(/\u00a0/g, " ");

  const beforeLabel = body.match(/([\d,]+)\s*\n\s*Razer Silver\b/i);
  if (beforeLabel) return parseNumber(beforeLabel[1]);

  const silverBlock = body.match(/Razer Silver[\s\S]{0,500}/i);
  if (!silverBlock) return 0;

  const beforeExpiring = silverBlock[0].split(/expiring/i)[0];
  const nums = [...beforeExpiring.matchAll(/\b([\d,]+)\b/g)]
    .map((m) => parseNumber(m[1]))
    .filter((n) => n >= 100);
  if (nums.length) return Math.max(...nums);

  const afterLabel = silverBlock[0].match(/Razer Silver[\s\S]{0,80}?([\d,]+)/i);
  return afterLabel ? parseNumber(afterLabel[1]) : 0;
}

export function parseBalancesFromText(text) {
  const body = String(text || "").replace(/\u00a0/g, " ");
  let goldBalance = 0;

  const goldBlock = body.match(/Razer Gold[\s\S]{0,500}/i);
  if (goldBlock) {
    const beforeLimit = goldBlock[0].split(/wallet\s*limit/i)[0];
    const dec = beforeLimit.match(/([\d,]+\.\d{1,2})/);
    if (dec) goldBalance = parseNumber(dec[1]);
    if (!goldBalance) {
      const intGold = beforeLimit.match(/\b([\d,]+)\b/);
      if (intGold) goldBalance = parseNumber(intGold[1]);
    }
  }

  const silverBalance = parseSilverBalance(body);

  if (!goldBalance && !silverBalance) return null;
  return { goldBalance, silverBalance, status: inferStatus(goldBalance, silverBalance) };
}

async function scrapeBalancesFromDom(page) {
  try {
    const text = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("section, article, div, li")];
      let gold = null;
      let silver = null;
      for (const el of cards) {
        const t = (el.innerText || "").replace(/\u00a0/g, " ");
        if (!gold && /Razer Gold/i.test(t) && !/Razer Silver/i.test(t)) {
          const block = t.split(/wallet\s*limit/i)[0];
          const m = block.match(/([\d,]+\.\d{1,2})/) || block.match(/\b([\d,]+)\b/);
          if (m) gold = m[1];
        }
        if (!silver && /Razer Silver/i.test(t) && !/Razer Silver Rewards/i.test(t)) {
          const beforeLabel = t.match(/([\d,]+)\s*\n\s*Razer Silver\b/i);
          if (beforeLabel) {
            silver = beforeLabel[1];
          } else {
            const block = t.split(/expiring/i)[0];
            const nums = [...block.matchAll(/\b([\d,]+)\b/g)]
              .map((m) => parseNumber(m[1]))
              .filter((n) => n >= 100);
            if (nums.length) silver = String(Math.max(...nums));
          }
        }
      }
      return { gold, silver };
    });
    const goldBalance = parseNumber(text?.gold);
    const silverBalance = parseNumber(text?.silver);
    if (!goldBalance && !silverBalance) return null;
    return { goldBalance, silverBalance, status: inferStatus(goldBalance, silverBalance) };
  } catch {
    return null;
  }
}

async function fillFirstVisible(page, selectors, value, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const loc = page.locator(sel);
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const el = loc.nth(i);
        try {
          if (await el.isVisible()) {
            await el.fill(String(value));
            return true;
          }
        } catch {
          /* next */
        }
      }
    }
    await sleep(300);
  }
  return false;
}

async function clickFirstVisible(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel);
    const count = await loc.count();
    for (let i = 0; i < count; i++) {
      const el = loc.nth(i);
      try {
        if (await el.isVisible() && await el.isEnabled()) {
          await el.click();
          return true;
        }
      } catch {
        /* next */
      }
    }
  }
  return false;
}

async function dismissCookieBanner(page) {
  await clickFirstVisible(page, [
    'button:has-text("บันทึกการตั้งค่าของฉัน")',
    'button:has-text("Accept All")',
    'button:has-text("ยอมรับทั้งหมด")',
    "#onetrust-accept-btn-handler",
    'button:has-text("ยกเลิก")',
  ]);
  await sleep(500);
}

async function loginRazerAccount(page, { email, password, totp }) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(2000);
  await dismissCookieBanner(page);

  const emailInput = page.locator("#input-login-email").first();
  await emailInput.waitFor({ state: "visible", timeout: 30000 });
  await emailInput.fill(String(email));

  const passInput = page.locator("#input-login-password").first();
  await passInput.waitFor({ state: "visible", timeout: 10000 });
  await passInput.click();
  await page.evaluate(() => {
    const el = document.querySelector("#input-login-password");
    if (el) el.removeAttribute("readonly");
  });
  try {
    await passInput.fill(String(password), { timeout: 15000 });
  } catch {
    await passInput.fill(String(password), { force: true, timeout: 15000 });
  }
  let passOk = (await passInput.inputValue()).length > 0;

  if (!passOk) {
    await clickFirstVisible(page, [
      "#btn-login-email",
      'button:has-text("Next")',
      'button:has-text("Continue")',
    ]);
    await sleep(1500);
    passOk = await fillFirstVisible(page, [
      "#input-login-password",
      'input[name="password"]:not([name="fakepasswordremembered"])',
      'input[type="password"]:not([name="fakepasswordremembered"])',
    ], password, { timeout: 20000 });
  }
  if (!passOk) throw Object.assign(new Error("Razer login: password field not found"), { status: 502 });

  const loginBtn = page.locator("#btn-log-in").first();
  await loginBtn.waitFor({ state: "visible", timeout: 10000 });
  await loginBtn.click({ timeout: 15000 }).catch(async () => {
    await clickFirstVisible(page, [
      "#btn-log-in",
      "#btn-login-password",
      'button:has-text("ลงชื่อเข้าใช้")',
      'button:has-text("Sign In")',
      'button:has-text("LOG IN")',
      'button:has-text("Log In")',
    ]);
  });
  await sleep(2500);

  if (totp) {
    const otpOk = await fillFirstVisible(page, [
      'input[name="otp"]',
      "input#otp",
      'input[autocomplete="one-time-code"]',
      'input[inputmode="numeric"]',
      'input[maxlength="6"]',
    ], totp, { timeout: 8000 });

    if (otpOk) {
      await clickFirstVisible(page, [
        'button[type="submit"]',
        'button:has-text("Verify")',
        'button:has-text("Continue")',
        'button:has-text("Submit")',
      ]);
      await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
      await sleep(2500);
    }
  } else {
    await page.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {});
    await sleep(1500);
  }
}

export async function syncRazerBalanceWithPlaywright({ email, password, otp, zone }) {
  if (!email || !password) {
    throw Object.assign(new Error("email และ password จำเป็น"), { status: 400 });
  }
  if (!otp) {
    throw Object.assign(new Error("OTP จำเป็น — กด「ดู OTP」ก่อน Sync"), { status: 400 });
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw Object.assign(new Error("ยังไม่ได้ติดตั้ง playwright — รัน: npm run razer:setup"), { status: 503 });
  }

  const captured = [];
  const browser = await chromium.launch({
    headless: process.env.RAZER_HEADLESS !== "0",
  });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT, locale: "en-US" });
    const page = await context.newPage();

    page.on("response", async (resp) => {
      try {
        const ct = resp.headers()["content-type"] || "";
        if (!ct.includes("json")) return;
        const url = resp.url();
        if (!/wallet|balance|gold|silver|reward|account/i.test(url)) return;
        const json = await resp.json();
        const parsed = parseBalancesFromApi(json);
        if (parsed) captured.push(parsed);
      } catch {
        /* ignore */
      }
    });

    await loginRazerAccount(page, { email, password, totp: otp });

    let result = captured[captured.length - 1] || null;
    for (const url of PROFILE_URLS) {
      if (result?.goldBalance && result?.silverBalance) break;
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
        await sleep(2500);
        result =
          (await scrapeBalancesFromDom(page)) ||
          captured[captured.length - 1] ||
          parseBalancesFromText(await page.innerText("body")) ||
          result;
      } catch {
        /* try next */
      }
    }

    if (!result) result = parseBalancesFromText(await page.innerText("body"));
    if (!result || (!result.goldBalance && !result.silverBalance)) {
      throw Object.assign(new Error(`อ่านยอด Gold/Silver ไม่ได้ (zone=${zone || "?"})`), { status: 502 });
    }

    return { ...result, message: "playwright", zone: zone || null };
  } finally {
    await browser.close();
  }
}
