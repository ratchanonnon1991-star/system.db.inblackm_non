import { plsAmount, plsFilters, plsSum, groupPlsOrders, plsSummary, plsMatches, plsCsv } from "./plsbuy-inventory.js";
import { sheetCents, sheetFigures } from "./usdcodashop-sheet.js";
import { signedUsd } from "./usdcodashop-ledger.js";
import { convertSaleThb } from "./usdcodashop-sale-conversion.js";

export const GAMEPOINT_METHOD = "GamePointClub";
export const GAMEPOINT_RATE = "7.84";
export const GAMEPOINT_PAGE_SIZE = 100;
// Reference only, never seed a wallet or subtract bot usage from this snapshot.
export const GAMEPOINT_REFERENCE = { opening: "34509.58", remaining: "11236.81" };
export const gpFilters = (query = {}) => plsFilters({ ...query, rate: query.rate ?? GAMEPOINT_RATE });
export { plsMatches as gpMatches, plsSummary as gpSummary };

export function gpDebit(row) {
  const savedLines = Array.isArray(row.lines) ? row.lines : [];
  const refs = Array.isArray(row.plan_refs) ? row.plan_refs : [];
  const lines = refs.length ? savedLines.filter((l) => refs.includes(l.key) || refs.includes(l.ref)) : savedLines;
  const expected = Math.max(Number(row.plan_total) || 1, Number(row.quantity) || 1, refs.length);
  const keys = lines.map((l) => String(l.ref || l.key || ""));
  const complete = lines.length === expected && new Set(keys).size === lines.length && new Set(refs).size === refs.length
    && keys.every(Boolean) && refs.every((r) => lines.some((l) => l.key === r || l.ref === r))
    && lines.every((l) => l.status === "done" && sheetCents(l.amount) !== null);
  let provider = complete ? plsSum(lines, (l) => l.amount) : null;
  let basis = complete ? "provider-lines" : "unknown";
  // A root response can be just the LAST invoice of a multi-pack order.
  if (!savedLines.length && expected === 1 && (Number(row.plan_total) === 1 || refs.length === 1) && plsAmount(row.provider_amount) !== null) {
    provider = plsAmount(row.provider_amount); basis = "provider-invoice";
  }
  const ledger = Array.isArray(row.ledger_slices) ? row.ledger_slices : [];
  const reliableLedger = ledger.length === 1 && ledger[0].supported === true && sheetCents(ledger[0].used) > 0n
    ? plsAmount(ledger[0].used) : null;
  if (provider !== null && reliableLedger !== null && provider !== reliableLedger) {
    return { used: null, basis: "conflict", warning: "ยอดตัด provider กับ ledger ไม่ตรงกัน ต้องตรวจสอบ", provider, ledger: reliableLedger };
  }
  if (provider === null && reliableLedger !== null) return { used: reliableLedger, basis: "ledger", warning: "ไม่มีผลยอดตัด provider ครบชุด ใช้ยอด ledger ที่บันทึก", provider, ledger: reliableLedger };
  if (provider === null) return { used: null, basis: "unknown", warning: "ไม่มียอดตัด MYR ที่ยืนยัน ไม่ใช้ stored_cost หรือราคาขายแทน", provider, ledger: reliableLedger };
  return { used: provider, basis, provider, ledger: reliableLedger,
    warning: ledger.length > 1 ? "พบหลายแถว ledger ใช้ยอด provider ครบชุดเท่านั้น กรุณาตรวจ ledger" : null };
}

export function gpObservation(row = {}) {
  const before = plsAmount(row.balance_before), time = row.submitted_at;
  if (before === null || typeof time !== "string" || !/^\d{4}-\d\d-\d\dT/.test(time) || !Number.isFinite(Date.parse(time))) return null;
  return { before, checkedAt: new Date(time).toISOString(), orderId: String(row.source_order_id || row.id), kind: "before" };
}
export function gpOrder(row, rate) {
  const debit = gpDebit(row), observation = gpObservation(row);
  const remainder = observation && debit.used !== null ? sheetCents(observation.before) - sheetCents(debit.used) : null;
  const wallet = remainder !== null && remainder >= 0n
    ? { ...observation, amount: signedUsd(remainder), kind: "calculated" } : null;
  const details = { ...(row.sheet_fields || {}), costThb: debit.used === null ? null : convertSaleThb(debit.used, rate),
    costBasis: "sheet-reference", costRate: rate, usageBasis: debit.basis, usageWarning: debit.warning,
    game: String(row.game_name || "").slice(0, 200), pack: String(row.pack_name || "").slice(0, 200),
    invoice: String(row.provider_ref || "").slice(0, 200), operator: String(row.operator || "Bot").slice(0, 160),
    storedCostMyr: plsAmount(row.stored_cost), balanceWarning: "ยอดหลังคำนวณจากยอดก่อน − ยอดตัด ไม่ใช่ยอด API หลังเติม" };
  return { id: String(row.id), orderId: String(row.sale_order_id || row.source_base || row.source_order_id || row.id),
    source: String(row.source || row.telegram_source || "").toLowerCase(), occurredAt: new Date(row.occurred_at).toISOString(),
    used: debit.used, wallet, observation, details, figures: sheetFigures(details),
    ledger: (row.ledger_slices || []).map((l) => ({ id: String(l.id), used: plsAmount(l.used), typed: l.typed === true })) };
}
export function groupGpOrders(entries) {
  return groupPlsOrders(entries).map((entry) => ({ ...entry, id: entry.fills.at(-1).id, occurredAt: entry.fills.at(-1).occurredAt }));
}
export const gpCsv = (entries) => plsCsv(entries)
  .replace('"MYR คงเหลือ"', '"MYR คงเหลือ (คำนวณ ไม่ใช่ API หลังเติม)"')
  .replace('"เวลาเช็กยอด (UTC)"', '"เวลาบันทึกก่อนส่ง (UTC)"')
  .replace('"MYR ก่อนเช็ก (รายการย่อยที่เช็กล่าสุด)"', '"MYR ก่อนที่บันทึก (รายการย่อยล่าสุด)"');
