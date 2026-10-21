import { inventoryError } from "./usdcodashop-inventory.js";
import { codaDateBounds } from "./usdcodashop-report.js";
import { sheetCents, sheetFigures } from "./usdcodashop-sheet.js";
import { signedUsd } from "./usdcodashop-ledger.js";
import { convertSaleThb } from "./usdcodashop-sale-conversion.js";

export const PLSBUY_METHOD = "PlsbuyMYR";
export const PLSBUY_REFERENCE_RATE = "7.723";
export const PLSBUY_SHEET_REFERENCE = { current: "14501.04", used: "4711.71", remaining: "9789.33", status: "ปกติ" };
export const PLSBUY_PAGE_SIZE = 100;
export const plsAmount = (v) => { const n = sheetCents(v); return n === null ? null : signedUsd(n); };
export function plsFilters({ dateFrom, dateTo, search = "", page = 1, rate = PLSBUY_REFERENCE_RATE } = {}) {
  if (!dateFrom || !dateTo) throw inventoryError("กรุณาเลือกช่วงวันที่");
  const bounds = codaDateBounds({ dateFrom, dateTo });
  if (Date.parse(bounds.end) - Date.parse(bounds.start) > 93 * 86400000) throw inventoryError("เลือกช่วงวันที่ได้ไม่เกิน 93 วัน");
  if (!/^\d{1,6}(?:\.\d{1,8})?$/.test(String(rate)) || !(Number(rate) > 0)) throw inventoryError("เรทต้องเป็นตัวเลขมากกว่าศูนย์");
  return { dateFrom, dateTo, bounds, search: String(search || "").trim().slice(0, 200), rate: String(rate),
    page: Number.isSafeInteger(Number(page)) && Number(page) > 0 && Number(page) <= 10000 ? Number(page) : 1 };
}
export function plsOrder(row, rate) {
  const used = plsAmount(row.myr_used), recorded = used === null ? null : plsAmount(row.recorded_cost);
  const cost = recorded ?? (used === null ? null : convertSaleThb(used, rate));
  const details = { ...(row.sheet_fields || {}), costThb: cost, costBasis: recorded !== null ? "recorded" : "sheet-reference",
    costRate: recorded !== null ? null : rate, game: String(row.game_name || "").slice(0, 200),
    pack: String(row.pack_name || "").slice(0, 200), invoice: String(row.provider_ref || "").slice(0, 200),
    operator: String(row.operator || "Bot").slice(0, 160) };
  return { id: String(row.id), orderId: String(row.sale_order_id || row.source_base || row.source_order_id || row.id),
    source: String(row.source || row.telegram_source || "").toLowerCase(), used, recordedCost: recorded,
    occurredAt: new Date(row.occurred_at).toISOString(), details, figures: sheetFigures(details),
    ledger: (row.ledger_slices || []).map((l) => ({ id: String(l.id), used: plsAmount(l.used), cost: l.typed ? plsAmount(l.cost) : null,
      balance: l.typed ? plsAmount(l.balance) : null, typed: l.typed === true })) };
}
export function plsSum(entries, get) {
  let sum = 0n;
  for (const e of entries) { const n = sheetCents(get(e)); if (n === null) return null; sum += n; }
  return signedUsd(sum);
}
export function groupPlsOrders(entries) {
  const groups = new Map();
  for (const e of entries) { const key = JSON.stringify([e.source, e.orderId]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e); }
  return [...groups.values()].map((fills) => {
    fills.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || Number(a.id) - Number(b.id));
    const first = fills[0], used = plsSum(fills, (e) => e.used);
    const allReference = fills.every((e) => e.details.costBasis === "sheet-reference" && e.details.costRate === first.details.costRate);
    const allRecorded = fills.every((e) => e.details.costBasis === "recorded");
    const payments = new Set(fills.map((e) => e.details.saleTotalThb));
    const distinct = (field) => [...new Set(fills.map((e) => e.details[field]).filter(Boolean))].join(" + ");
    const details = { ...first.details, saleThb: payments.size > 1 ? null : plsSum(fills, (e) => e.figures.sale),
      costThb: allReference && used !== null ? convertSaleThb(used, first.details.costRate) : plsSum(fills, (e) => e.figures.cost),
      costBasis: allReference ? "sheet-reference" : allRecorded ? "recorded" : "mixed",
      game: distinct("game"), pack: distinct("pack"), invoice: distinct("invoice") };
    return { ...first, used, details, figures: sheetFigures(details), fillCount: fills.length, fills };
  });
}
export function plsSummary(entries) {
  const sale = plsSum(entries, (e) => e.figures.sale), cost = plsSum(entries, (e) => e.figures.cost);
  return { orders: entries.length, fills: entries.reduce((n, e) => n + e.fillCount, 0), used: plsSum(entries, (e) => e.used),
    ...sheetFigures({ saleThb: sale, costThb: cost }), missingSales: entries.filter((e) => e.figures.sale === null).length,
    missingUsage: entries.filter((e) => e.used === null).length, missingCosts: entries.filter((e) => e.figures.cost === null).length };
}
export const plsMatches = (entry, search) => !search || [entry.orderId,
  ...Object.values(entry.details).filter((v) => typeof v === "string")].join(" ").toLowerCase().includes(search.toLowerCase());
export function plsCsv(entries) {
  const quote = (v, numeric = false) => { let s = v == null ? "" : String(v); if (!(numeric && /^-?\d+(?:\.\d+)?$/.test(s)) && /^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
  const rows = [["วันที่ (ไทย)", "Order", "ยอดโอน THB", "ต้นทุน THB (อาจเป็นอ้างอิง)", "กำไร THB (อาจเป็นอ้างอิง)", "กำไร %", "MYR ออก", "ฐานต้นทุน", "เรทอ้างอิง", "เกม", "แพ็ก", "ผู้เติม", "เลขธุรกรรม", "รายการย่อย"]];
  for (const e of entries) rows.push([new Date(e.occurredAt).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }), e.orderId,
    e.figures.sale, e.figures.cost, e.figures.profit, e.figures.margin, e.used, e.details.costBasis, e.details.costRate,
    e.details.game, e.details.pack, e.details.sheetOperator || e.details.operator, e.details.invoice, e.fillCount]);
  return "\uFEFF" + rows.map((row, i) => row.map((v, c) => quote(v, i > 0 && ((c >= 2 && c <= 6) || c === 8))).join(",")).join("\r\n");
}
