import { inventoryError } from "./usdcodashop-inventory.js";
import { codaDateBounds } from "./usdcodashop-report.js";
import { sheetCents, sheetFigures } from "./usdcodashop-sheet.js";
import { signedUsd } from "./usdcodashop-ledger.js";
import { convertSaleThb } from "./usdcodashop-sale-conversion.js";
import { RAZER_STATUSES } from "./profit-razer-status.js";

export const RAZER_INVENTORY_ZONES = ["SGD", "CAD"];
export const RAZER_INVENTORY_PAGE_SIZE = 100;
export const razerEmail = (v) => String(v || "").trim().toLowerCase();
export const razerWalletKey = (email, zone) => `${zone}:${razerEmail(email)}`;
export const razerAmount = (v) => { const n = sheetCents(v); return n === null ? null : signedUsd(n); };
export function razerFilters({ dateFrom, dateTo, zone = "", account = "", status = "", search = "", page = 1, accountPage = 1, rates = "{}", showHidden = "false" } = {}) {
  if (!dateFrom || !dateTo) throw inventoryError("กรุณาเลือกช่วงวันที่");
  const bounds = codaDateBounds({ dateFrom, dateTo });
  if (Date.parse(bounds.end) - Date.parse(bounds.start) > 93 * 86400000) throw inventoryError("เลือกช่วงวันที่ได้ไม่เกิน 93 วัน");
  if (zone && !RAZER_INVENTORY_ZONES.includes(zone)) throw inventoryError("รองรับ SGD และ CAD ก่อน");
  if (status && ![...RAZER_STATUSES, "READY", "UNVERIFIED"].includes(status)) throw inventoryError("สถานะไม่ถูกต้อง");
  if (typeof account !== "string" || account.length > 300) throw inventoryError("บัญชีไม่ถูกต้อง");
  let overrides;
  try { overrides = JSON.parse(String(rates)); } catch { throw inventoryError("เรทไม่ถูกต้อง"); }
  if (!overrides || Array.isArray(overrides) || typeof overrides !== "object") throw inventoryError("เรทไม่ถูกต้อง");
  for (const [key, value] of Object.entries(overrides)) {
    if (!RAZER_INVENTORY_ZONES.includes(key) || !/^\d{1,6}(?:\.\d{1,8})?$/.test(String(value)) || !(Number(value) > 0)) throw inventoryError("เรทต้องเป็นตัวเลขมากกว่าศูนย์");
  }
  const number = (v) => Number.isSafeInteger(Number(v)) && Number(v) > 0 && Number(v) <= 10000 ? Number(v) : 1;
  return { dateFrom, dateTo, zone, account, status, search: String(search || "").trim().slice(0, 200),
    bounds, rates: overrides, page: number(page), accountPage: number(accountPage), showHidden: showHidden === "true" };
}
export function razerUsage(row) {
  const before = sheetCents(row.old_balance_gold), after = sheetCents(row.new_balance_gold), reported = sheetCents(row.deducted);
  if (before !== null && after !== null) {
    if (before < after || (reported !== null && before - after !== reported)) return { used: null, conflict: true };
    return { used: signedUsd(before - after), conflict: false };
  }
  return { used: reported === null ? null : signedUsd(reported), conflict: false };
}
export function razerSum(entries, get) {
  let sum = 0n;
  for (const e of entries) { const n = sheetCents(get(e)); if (n === null) return null; sum += n; }
  return signedUsd(sum);
}
export function razerStockAccounts(stock, latest) {
  const byKey = new Map();
  for (const row of stock) {
    const zone = String(row.zone || "").toUpperCase(), email = razerEmail(row.email);
    if (!email || !RAZER_INVENTORY_ZONES.includes(zone)) continue;
    const key = razerWalletKey(email, zone);
    if (byKey.has(key)) throw inventoryError("บัญชีสต็อกซ้ำ ต้องตรวจสอบก่อนรวมยอด", 409);
    byKey.set(key, { key, email, zone, stockId: String(row.id), status: String(row.status || "UNVERIFIED"),
      hidden: row.hidden === true, botEnabled: row.bot_enabled === true, rate: Number(row.rate) > 0 ? String(row.rate) : null,
      gold: razerAmount(row.gold_balance), silver: razerAmount(row.silver_balance), balanceAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
      balanceSource: "stock", inUse: Boolean(row.in_use_order_id) });
  }
  for (const row of latest) {
    const zone = String(row.currency_code || "").toUpperCase(), email = razerEmail(row.purchase_email);
    if (!email || !RAZER_INVENTORY_ZONES.includes(zone)) continue;
    const key = razerWalletKey(email, zone), previous = byKey.get(key);
    const at = new Date(row.balance_received_at || row.completed_at || row.occurred_at).toISOString();
    const next = previous || { key, email, zone, stockId: null, status: "UNVERIFIED", hidden: false, botEnabled: null, rate: null, inUse: false };
    // Do not mark metadata edits as a fresh balance observation.
    if (!previous || !previous.balanceAt || at > previous.balanceAt) Object.assign(next, {
      gold: razerAmount(row.new_balance_gold), silver: razerAmount(row.new_balance_silver), balanceAt: at, balanceSource: "purchase",
    });
    byKey.set(key, next);
  }
  return [...byKey.values()].sort((a, b) => a.zone.localeCompare(b.zone) || a.email.localeCompare(b.email));
}
export function razerOrder(row, account, rates = {}) {
  const zone = String(row.currency_code || "").toUpperCase(), email = razerEmail(row.purchase_email), usage = razerUsage(row);
  const rate = rates[zone] ?? account?.rate ?? null;
  const details = { ...(row.sheet_fields || {}), costThb: rate && usage.used !== null ? convertSaleThb(usage.used, rate) : null,
    costRate: rate, costBasis: rates[zone] != null ? "view-reference" : rate ? "stock-current-reference" : null,
    game: String(row.game_name || "").slice(0, 200), pack: String(row.pack_name || "").slice(0, 200),
    invoice: String(row.razer_order_no || row.transaction_id || "").slice(0, 200), operator: String(row.operator || "Bot").slice(0, 160) };
  return { id: String(row.history_id), codaId: row.id == null ? null : String(row.id), zone, email,
    walletKey: email ? razerWalletKey(email, zone) : `unknown:${row.history_id}`,
    orderId: String(row.sale_order_id || row.source_base || row.source_order_id || `receipt-${row.history_id}`),
    source: String(row.source || row.telegram_source || "").toLowerCase(),
    occurredAt: new Date(row.occurred_at).toISOString(), observedAt: new Date(row.balance_received_at || row.completed_at || row.occurred_at).toISOString(),
    balance: razerAmount(row.new_balance_gold), ...usage, details, figures: sheetFigures(details) };
}
export function groupRazerOrders(entries) {
  const groups = new Map();
  for (const e of entries) { const key = JSON.stringify([e.walletKey, e.source, e.orderId]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e); }
  return [...groups.values()].map((fills) => {
    fills.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || Number(a.id) - Number(b.id));
    const first = fills[0], latest = [...fills].sort((a, b) => b.observedAt.localeCompare(a.observedAt) || Number(b.id) - Number(a.id))[0];
    const used = razerSum(fills, (e) => e.used), rates = new Set(fills.map((e) => e.details.costRate));
    const paymentEvidence = new Set(fills.map((e) => e.details.saleTotalThb));
    const distinct = (field) => [...new Set(fills.map((e) => e.details[field]).filter(Boolean))].join(" + ");
    const details = { ...first.details, saleThb: paymentEvidence.size > 1 ? null : razerSum(fills, (e) => e.figures.sale),
      costThb: rates.size === 1 && first.details.costRate && used !== null ? convertSaleThb(used, first.details.costRate) : null,
      game: distinct("game"), pack: distinct("pack"), invoice: distinct("invoice") };
    return { ...first, used, balance: latest.balance, observedAt: latest.observedAt,
      conflict: fills.some((e) => e.conflict), fillCount: fills.length, fills, details, figures: sheetFigures(details) };
  });
}
export function razerSummary(entries) {
  const sale = razerSum(entries, (e) => e.figures.sale), cost = razerSum(entries, (e) => e.figures.cost);
  return { orders: entries.length, fills: entries.reduce((n, e) => n + e.fillCount, 0), ...sheetFigures({ saleThb: sale, costThb: cost }),
    missingSales: entries.filter((e) => e.figures.sale === null).length, missingCosts: entries.filter((e) => e.figures.cost === null).length };
}
export const razerMatches = (entry, search) => !search || [entry.email, entry.orderId,
  ...Object.values(entry.details || {}).filter((v) => typeof v === "string")].join(" ").toLowerCase().includes(search.toLowerCase());
export function razerCsv(entries) {
  const quote = (v, numeric = false) => { let s = v == null ? "" : String(v); if (!(numeric && /^-?\d+(?:\.\d+)?$/.test(s)) && /^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
  const rows = [["วันที่ (ไทย)", "Order", "บัญชี", "สกุลเงิน", "ยอดโอน THB", "ต้นทุนอ้างอิง THB", "กำไรอ้างอิง THB", "กำไรอ้างอิง %", "Gold ออก", "Gold คงเหลือ", "เกม", "แพ็ก", "เลขธุรกรรม", "จำนวนรายการย่อย", "เรทต้นทุนอ้างอิง", "ฐานต้นทุน"]];
  for (const e of entries) rows.push([new Date(e.occurredAt).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }), e.orderId, e.email, e.zone,
    e.figures.sale, e.figures.cost, e.figures.profit, e.figures.margin, e.used, e.balance, e.details.game, e.details.pack,
    e.details.invoice, e.fillCount, e.details.costRate, e.details.costBasis]);
  return "\uFEFF" + rows.map((row, i) => row.map((v, c) => quote(v, i > 0 && ((c >= 4 && c <= 9) || c === 14))).join(",")).join("\r\n");
}
