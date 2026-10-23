import { inventoryError } from "./usdcodashop-inventory.js";
import { codaDateBounds } from "./usdcodashop-report.js";
import { sheetCents, sheetFigures } from "./usdcodashop-sheet.js";
import { signedUsd } from "./usdcodashop-ledger.js";
import { convertSaleThb } from "./usdcodashop-sale-conversion.js";

export const DONSHOP_METHOD = "DonShopIDR";
// THB per IDR used only for the on-screen reference cost; not a locked purchase rate.
export const DONSHOP_REFERENCE_RATE = "0.0019";
export const DONSHOP_PAGE_SIZE = 100;
export const DONSHOP_STATUSES = [["completed", "สำเร็จ"], ["manual", "Manual"], ["failed", "Failed"], ["pending", "Pending"], ["wait", "Wait"]];
export const dsStatusLabel = (status) => DONSHOP_STATUSES.find(([key]) => key === status)?.[1] || String(status || "ไม่ระบุ");
export const dsAmount = (v) => { const n = sheetCents(v); return n === null ? null : signedUsd(n); };
// Wallet drawdown: live_cost_total matches the sequential balance_before; fall back to live_cost × quantity.
export function dsUsed(row = {}) {
  const total = sheetCents(row.live_cost_total);
  if (total !== null) return signedUsd(total);
  const unit = sheetCents(row.live_cost), qty = row.quantity == null || row.quantity === "" ? 1 : Number(row.quantity);
  return unit !== null && Number.isSafeInteger(qty) && qty >= 1 && qty <= 1000 ? signedUsd(unit * BigInt(qty)) : null;
}
// Only a completed fill drew the wallet down (manual rows keep the next order's balance_before unchanged).
export function dsWallet(row = {}) {
  if (row.status !== "completed") return null;
  const before = sheetCents(row.balance_before), used = sheetCents(dsUsed(row));
  if (before === null || used === null) return null;
  return { before: signedUsd(before), used: signedUsd(used), amount: signedUsd(before - used),
    checkedAt: new Date(row.occurred_at).toISOString(), orderId: String(row.source_order_id || row.id || "") };
}
export function dsFilters({ dateFrom, dateTo, search = "", page = 1, rate = DONSHOP_REFERENCE_RATE, status = "" } = {}) {
  if (!dateFrom || !dateTo) throw inventoryError("กรุณาเลือกช่วงวันที่");
  const bounds = codaDateBounds({ dateFrom, dateTo });
  if (Date.parse(bounds.end) - Date.parse(bounds.start) > 93 * 86400000) throw inventoryError("เลือกช่วงวันที่ได้ไม่เกิน 93 วัน");
  if (!/^\d{1,6}(?:\.\d{1,8})?$/.test(String(rate)) || !(Number(rate) > 0)) throw inventoryError("เรทต้องเป็นตัวเลขมากกว่าศูนย์");
  const wanted = String(status || "");
  if (wanted && !DONSHOP_STATUSES.some(([key]) => key === wanted)) throw inventoryError("สถานะไม่ถูกต้อง");
  return { dateFrom, dateTo, bounds, search: String(search || "").trim().slice(0, 200), rate: String(rate), status: wanted || null,
    page: Number.isSafeInteger(Number(page)) && Number(page) > 0 && Number(page) <= 10000 ? Number(page) : 1 };
}
export function dsOrder(row, rate) {
  const completed = row.status === "completed", quoted = dsUsed(row), used = completed ? quoted : null;
  const sheet = row.sheet_fields || {};
  const details = { ...sheet, saleThb: completed ? sheet.saleThb ?? null : null, costThb: used === null ? null : convertSaleThb(used, rate),
    costRate: rate, game: String(row.game_name || "").slice(0, 200), pack: String(row.pack_name || "").slice(0, 200),
    invoice: String(row.provider_ref || "").slice(0, 200), operator: String(row.operator || "Bot").slice(0, 160) };
  return { id: String(row.id), orderId: String(row.sale_order_id || row.source_base || row.source_order_id || row.id),
    source: String(row.source || row.telegram_source || "").toLowerCase(), status: String(row.status || ""), used, quoted,
    wallet: dsWallet(row), occurredAt: new Date(row.occurred_at).toISOString(), details, figures: sheetFigures(details) };
}
export function dsSum(entries, get) {
  let sum = 0n;
  for (const e of entries) { const n = sheetCents(get(e)); if (n === null) return null; sum += n; }
  return signedUsd(sum);
}
export function groupDsOrders(entries, rate) {
  const groups = new Map();
  for (const e of entries) { const key = JSON.stringify([e.source, e.orderId]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e); }
  return [...groups.values()].map((fills) => {
    fills.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || Number(a.id) - Number(b.id));
    const first = fills[0], done = fills.filter((f) => f.status === "completed");
    const used = done.length ? dsSum(done, (e) => e.used) : null;
    const payments = new Set(done.map((e) => e.details.saleTotalThb));
    const distinct = (field) => [...new Set(fills.map((e) => e.details[field]).filter(Boolean))].join(" + ");
    const details = { ...first.details, saleThb: !done.length || payments.size > 1 ? null : dsSum(done, (e) => e.figures.sale),
      costThb: used === null ? null : convertSaleThb(used, rate), game: distinct("game"), pack: distinct("pack"), invoice: distinct("invoice") };
    const statuses = {};
    for (const f of fills) statuses[f.status] = (statuses[f.status] || 0) + 1;
    const wallet = done.map((f) => f.wallet).filter(Boolean).sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)).at(-1) || null;
    return { ...first, used, details, wallet, statuses, completedCount: done.length, figures: sheetFigures(details), fillCount: fills.length, fills };
  });
}
// Totals cover delivered orders only: a failed/manual/pending fill is listed but never counted as sale, cost or IDR out.
export function dsSummary(entries) {
  const delivered = entries.filter((e) => e.completedCount > 0);
  const sale = dsSum(delivered, (e) => e.figures.sale), cost = dsSum(delivered, (e) => e.figures.cost);
  const statuses = {};
  for (const e of entries) for (const [key, n] of Object.entries(e.statuses)) statuses[key] = (statuses[key] || 0) + n;
  return { orders: entries.length, delivered: delivered.length, fills: entries.reduce((n, e) => n + e.fillCount, 0), statuses,
    used: dsSum(delivered, (e) => e.used), ...sheetFigures({ saleThb: sale, costThb: cost }),
    missingSales: delivered.filter((e) => e.figures.sale === null).length,
    missingUsage: delivered.filter((e) => e.used === null).length, missingCosts: delivered.filter((e) => e.figures.cost === null).length };
}
export const DONSHOP_CHECK_KINDS = [["gap", "เงินหาย ไม่ทราบสาเหตุ"], ["charged", "คิวไม่สำเร็จ แต่โดนหักเงิน"], ["refunded", "หักแล้วได้คืน"], ["evidence", "ข้อมูลไม่พอให้เช็ค"], ["topup", "เงินเพิ่ม (น่าจะเติมเงิน)"]];
export const DONSHOP_CHECK_DEFAULTS = { enabled: true, minIdr: "1", kinds: { gap: true, charged: true, refunded: false, evidence: false, topup: false } };
// A row whose updated_at is this long after created_at was changed later (by a person or a slow bot retry; the DB does not say which).
export const DONSHOP_LATE_MINUTES = 30;
// Per-viewer check settings (browser storage only); anything unknown falls back to the defaults.
export function dsCheckSettings(raw = {}) {
  const d = DONSHOP_CHECK_DEFAULTS, kinds = {}, min = String(raw?.minIdr ?? d.minIdr);
  for (const [key] of DONSHOP_CHECK_KINDS) kinds[key] = typeof raw?.kinds?.[key] === "boolean" ? raw.kinds[key] : d.kinds[key];
  return { enabled: typeof raw?.enabled === "boolean" ? raw.enabled : d.enabled, kinds, minIdr: /^\d{1,12}$/.test(min) ? min : d.minIdr };
}
function dsRef(r) {
  const at = new Date(r.occurred_at), updated = r.updated_at ? new Date(r.updated_at) : null, late = updated ? Math.floor((updated - at) / 60000) : null;
  return { id: String(r.id), orderId: String(r.source_order_id || r.id), status: String(r.status || ""), at: at.toISOString(),
    updatedAt: updated ? updated.toISOString() : null, lateMinutes: late !== null && late >= DONSHOP_LATE_MINUTES ? late : null };
}
const lateRefs = (...refs) => refs.flat().filter((r) => r.lateMinutes !== null);
// Wallet continuity over every DonShopIDR row in time order: a completed fill's balance_before should equal the previous
// completed fill's balance_before − IDR out, minus completed fills that logged no balance_before. Evidence only: a drop is
// IDR that left outside the counted fills; a rise is assumed to be a top-up (no Donshop top-up record exists to confirm it).
export function dsWalletChecks(rows, anchor = null) {
  const alerts = [], known = (r) => sheetCents(r.balance_before) !== null && sheetCents(dsUsed(r)) !== null;
  let prev = anchor && known(anchor) ? anchor : null, between = [];
  for (const row of rows) {
    if (row.status !== "completed") { between.push(row); continue; }
    const before = sheetCents(row.balance_before), used = sheetCents(dsUsed(row)), order = dsRef(row);
    if (before === null || used === null) alerts.push({ key: `evidence:${order.id}`, kind: "evidence", at: order.at, amount: null, order, missing: before === null ? "before" : "used", late: lateRefs(order) });
    if (before === null) { between.push(row); continue; }
    if (prev) {
      let expected = sheetCents(prev.balance_before) - sheetCents(dsUsed(prev)), complete = true;
      for (const r of between) if (r.status === "completed") { const u = sheetCents(dsUsed(r)); if (u === null) complete = false; else expected -= u; }
      const diff = complete ? before - expected : 0n, from = dsRef(prev), others = between.filter((r) => r.status !== "completed").map((r) => ({ ...dsRef(r), quoted: dsUsed(r) }));
      const base = { at: order.at, order, from, expected: signedUsd(expected), actual: signedUsd(before), late: lateRefs(from, between.map(dsRef), order) };
      if (diff > 0n) alerts.push({ key: `topup:${order.id}`, kind: "topup", amount: signedUsd(diff), ...base });
      if (diff < 0n) {
        // A drop equal to one non-completed fill's quote (or all of them together) points at a fill that was charged but not marked completed.
        const loss = -diff;
        const cents = others.map((o) => sheetCents(o.quoted)), one = others.filter((_, i) => cents[i] === loss).slice(0, 1);
        const suspects = one.length ? one : others.length > 1 && cents.every((c) => c !== null) && cents.reduce((a, b) => a + b, 0n) === loss ? others : [];
        const kind = suspects.length ? "charged" : "gap";
        alerts.push({ key: `${kind}:${order.id}`, kind, amount: signedUsd(loss), ...base, suspects, between: others });
      }
    }
    prev = used === null ? null : row; between = [];
  }
  // A drop that the very next link gives back exactly was charged and then refunded: one "refunded" note, not a loss plus a top-up.
  const rises = new Map(alerts.filter((a) => a.kind === "topup").map((a) => [a.from.id, a])), merged = new Set();
  return alerts.flatMap((a) => {
    if (merged.has(a)) return [];
    const back = a.kind === "gap" || a.kind === "charged" ? rises.get(a.order.id) : null;
    if (!back || back.amount !== a.amount) return [a];
    merged.add(back);
    return [{ ...a, key: `refunded:${a.order.id}`, kind: "refunded", wasKind: a.kind, refund: back, late: [...a.late, ...back.late.filter((l) => !a.late.some((x) => x.id === l.id))] }];
  });
}
export function dsVisibleAlerts(alerts = [], settings = DONSHOP_CHECK_DEFAULTS) {
  const s = dsCheckSettings(settings), min = Number(s.minIdr);
  if (!s.enabled) return [];
  return alerts.filter((a) => s.kinds[a.kind] && (a.amount == null || Number(a.amount) >= min)).sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
}
// Queue ids are searchable too, since balance alerts name orders by queue.
export const dsMatches = (entry, search) => !search || [entry.orderId, ...(entry.fills || []).map((f) => f.id),
  ...Object.values(entry.details).filter((v) => typeof v === "string")].join(" ").toLowerCase().includes(search.toLowerCase());
export function dsCsv(entries) {
  const quote = (v, numeric = false) => { let s = v == null ? "" : String(v); if (!(numeric && /^-?\d+(?:\.\d+)?$/.test(s)) && /^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
  const rows = [["วันที่ (ไทย)", "Order", "สถานะ", "ยอดโอน THB", "ต้นทุน THB (อ้างอิง)", "กำไร THB (อ้างอิง)", "กำไร %", "IDR ออก", "เรทอ้างอิง THB/IDR", "เกม", "แพ็ก", "ผู้เติม", "เลขธุรกรรม", "รายการย่อย", "IDR ก่อนตัด (รายการสำเร็จล่าสุด)", "IDR คงเหลือ"]];
  for (const e of entries) rows.push([new Date(e.occurredAt).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }), e.orderId,
    Object.entries(e.statuses).map(([key, n]) => `${dsStatusLabel(key)} ${n}`).join(" + "),
    e.figures.sale, e.figures.cost, e.figures.profit, e.figures.margin, e.used, e.details.costRate,
    e.details.game, e.details.pack, e.details.sheetOperator || e.details.operator, e.details.invoice, e.fillCount,
    e.wallet?.before, e.wallet?.amount]);
  return "﻿" + rows.map((row, i) => row.map((v, c) => quote(v, i > 0 && ((c >= 3 && c <= 8) || c === 14 || c === 15))).join(",")).join("\r\n");
}
