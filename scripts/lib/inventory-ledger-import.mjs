// Pure: channel registry CSV -> accountInput bodies for registerAccounts.

/** Minimal RFC 4180 CSV reader (quoted cells, "" escapes, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const s = String(text).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

// Which bot/inventory family an account belongs to, for grouping and future links to bot pages.
const PROVIDERS = [
  [/wave\s*pay/i, "wavepay"], [/\bu9\b/i, "u9"], [/\batom\b/i, "atom"], [/bitcash/i, "bitcash"], [/moniepoint/i, "moniepoint"],
  [/itunes?/i, "itunes"], [/lao\s*s?\s*telecom/i, "laos-telecom"], [/xsolla/i, "xsolla"], [/net\s*ease/i, "netease"],
  [/codashop/i, "codashop"], [/multi\s*game\s*card/i, "multigamecard"], [/true\s*wallet/i, "truemoney"], [/razer/i, "razer"],
  [/gamepoint/i, "gamepoint"], [/plsbuy/i, "plsbuy"], [/donshop/i, "donshop"], [/my\s*card/i, "mycard"], [/unipin/i, "unipin"],
  [/g-?cash/i, "gcash"], [/ether\.?fi/i, "etherfi"], [/youtrip/i, "youtrip"], [/psn/i, "psn"], [/xbox/i, "xbox"],
  [/google/i, "google-play"], [/roblox/i, "roblox"], [/\b(ais|dtac|tnt)\b/i, "mobile-credit"], [/kbz|yoma|cb bank|bri\b|ktb|krungsri/i, "bank"],
];
const CURRENCY = /^[A-Z]{2,10}$/;

export function importRowsFromCsv(text) {
  const [header, ...rows] = parseCsv(text);
  const col = name => header.findIndex(h => h.trim().startsWith(name));
  const fileCol = col("ไฟล์"), tabCol = col("แท็บ"), curCol = col("สกุลเงิน"), statusCol = col("สถานะ");
  if (fileCol < 0 || tabCol < 0) throw new Error("CSV ต้องมีคอลัมน์ ไฟล์ และ แท็บ");
  const accounts = [], skipped = [], seen = new Set();
  for (const r of rows) {
    const category = (r[fileCol] ?? "").trim().replace(/[_\s]+$/, ""), tab = (r[tabCol] ?? "").trim();
    if (!category || !tab) { skipped.push(`แถวว่าง (${category || "?"} / ${tab || "?"})`); continue; }
    const ref = `${category} :: ${tab}`;
    if (seen.has(ref)) { skipped.push(`ซ้ำ: ${ref}`); continue; }
    seen.add(ref);
    const currency = (r[curCol] ?? "").trim().toUpperCase();
    accounts.push({
      provider: PROVIDERS.find(([re]) => re.test(tab) || re.test(category))?.[1] ?? "channel",
      ref, label: tab, category,
      currency: CURRENCY.test(currency) ? currency : "UNKNOWN",
      status: /ปิด|ระงับ|ใช้แล้วทิ้ง/.test(`${tab} ${r[statusCol] ?? ""}`) ? "disabled" : "active",
    });
  }
  return { accounts, skipped };
}
