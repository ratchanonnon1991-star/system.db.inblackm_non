import { inventoryError } from "./usdcodashop-inventory.js";
import { signedUsd } from "./usdcodashop-ledger.js";
import { codaDateBounds } from "./usdcodashop-report.js";
import { sheetCents, sheetFigures } from "./usdcodashop-sheet.js";

export const WAVEPAY_METHOD = "WavePay";
export const WAVEPAY_UNKNOWN_PHONE = "";
export const WAVEPAY_PAGE_SIZE = 100;
// Every order in the range is read to total sale/cost/profit, so the range is bounded.
export const WAVEPAY_MAX_ORDERS = 20000;
export const WAVEPAY_MAX_DAYS = 93;
// WavePay is counted from this Thai calendar day; earlier orders are never shown or totalled.
export const WAVEPAY_START_DATE = "2026-10-15";
// Cost basis: THB = MMK used ÷ this rate (fixed, not inventory_transactions.cost_thb).
export const WAVEPAY_MMK_PER_THB = "126.68";

// Same rule as the bot (NormalizeWaveMsisdn): 959xxxxxxxx / 9xxxxxxxx → 09xxxxxxxx.
export function wavePhoneKey(value) {
  let d = String(value ?? "").replace(/\D/g, "");
  if (d.startsWith("959")) d = `0${d.slice(2)}`;
  else if (d.startsWith("9")) d = `0${d}`;
  return d;
}
// The SQL twin of wavePhoneKey; keep both in sync.
export const WAVE_PHONE_SQL = `CASE
  WHEN regexp_replace(COALESCE(c.phone_number,''),'\\D','','g') LIKE '959%' THEN '0'||substr(regexp_replace(c.phone_number,'\\D','','g'),3)
  WHEN regexp_replace(COALESCE(c.phone_number,''),'\\D','','g') LIKE '9%' THEN '0'||regexp_replace(c.phone_number,'\\D','','g')
  ELSE regexp_replace(COALESCE(c.phone_number,''),'\\D','','g') END`;

export function wavePhoneLabel(phone) {
  return phone ? phone : "ไม่ทราบเบอร์";
}

export function waveDefaultDates(today) {
  return { dateFrom: WAVEPAY_START_DATE > today.dateFrom ? WAVEPAY_START_DATE : today.dateFrom, dateTo: today.dateTo };
}

export function waveFilters({ dateFrom = "", dateTo = "", phone = null, search = "", page = 1 } = {}) {
  if (!dateFrom || !dateTo) throw inventoryError("กรุณาเลือกช่วงวันที่");
  codaDateBounds({ dateFrom, dateTo });
  if (dateTo < WAVEPAY_START_DATE) throw inventoryError(`WavePay เริ่มนับตั้งแต่ ${WAVEPAY_START_DATE} กรุณาเลือกวันที่ตั้งแต่วันนั้น`);
  if (dateFrom < WAVEPAY_START_DATE) dateFrom = WAVEPAY_START_DATE;
  const bounds = codaDateBounds({ dateFrom, dateTo });
  if (new Date(bounds.end) - new Date(bounds.start) > WAVEPAY_MAX_DAYS * 86400000) {
    throw inventoryError(`เลือกช่วงวันที่ได้ไม่เกิน ${WAVEPAY_MAX_DAYS} วัน`);
  }
  const selected = phone == null ? null : wavePhoneKey(phone);
  if (selected && !/^0\d{8,10}$/.test(selected)) throw inventoryError("เบอร์ไม่ถูกต้อง");
  return { dateFrom, dateTo, bounds, phone: selected, search: String(search ?? "").trim().slice(0, 200),
    page: Math.max(1, Math.min(10000, Number.parseInt(page, 10) || 1)) };
}

// Kyat arrives as "125000.5" (balances) or "Ks11,000" (pack_price). Unknown stays null, never zero.
export function kyat(value) {
  if (value == null) return null;
  const cents = sheetCents(String(value).replace(/^\s*Ks\s*/i, "").replaceAll(",", "").trim());
  return cents === null ? null : signedUsd(cents);
}
// MMK used: the wallet's own before − after read; pack_price only when that pair is missing.
export function waveUsage(row) {
  const before = kyat(row.old_balance); const after = kyat(row.new_balance);
  if (before != null && after != null && sheetCents(before) >= sheetCents(after)) {
    return { usedMmk: signedUsd(sheetCents(before) - sheetCents(after)), usedSource: "balances" };
  }
  const pack = kyat(row.pack_price);
  return pack == null ? { usedMmk: null, usedSource: null } : { usedMmk: pack, usedSource: "pack" };
}

// Half-up to satang from the exact MMK amount; no intermediate rounding.
export function waveCostThb(usedMmk) {
  const cents = usedMmk == null ? null : sheetCents(usedMmk);
  if (cents === null) return null;
  const rate = sheetCents(WAVEPAY_MMK_PER_THB);
  return signedUsd((cents * 100n + rate / 2n) / rate);
}

export function normalizeWaveOrder(row) {
  const fields = row.sheet_fields || {};
  const { usedMmk, usedSource } = waveUsage(row);
  const details = {
    game: String(row.game_name || "").slice(0, 200), pack: String(row.pack_name || "").slice(0, 300),
    operator: String(row.operator || "Bot").slice(0, 160), invoice: String(row.invoice_number || "").slice(0, 1000),
    costThb: waveCostThb(usedMmk),
    ...fields,
  };
  return {
    id: String(row.id), orderId: String(row.sale_order_id || row.source_order_id || row.id).slice(0, 200),
    phone: String(row.phone_key || ""), occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    usedMmk, usedSource, balanceMmk: kyat(row.new_balance),
    details,
  };
}

function signedCents(value) {
  const text = String(value); const negative = text.startsWith("-");
  const cents = sheetCents(negative ? text.slice(1) : text);
  return cents === null ? null : negative ? -cents : cents;
}
// One unknown order makes the total unknown: a partial sum would look like a real figure.
const add = (total, value) => {
  const cents = total === null || value == null ? null : signedCents(value);
  return cents === null ? null : total + cents;
};

export function summarizeWaveLines(entries, latest = []) {
  const lines = new Map();
  const line = (phone) => {
    if (!lines.has(phone)) lines.set(phone, { phone, orders: 0, used: 0n, sale: 0n, cost: 0n, profit: 0n,
      missingSales: 0, missingCosts: 0, missingUsage: 0, balance: null, balanceAt: null, balanceOrderId: null });
    return lines.get(phone);
  };
  for (const entry of entries) {
    const l = line(entry.phone); const f = sheetFigures(entry.details);
    l.orders++;
    if (entry.usedMmk == null) l.missingUsage++; else l.used += sheetCents(entry.usedMmk);
    if (f.sale == null) l.missingSales++;
    if (f.cost == null) l.missingCosts++;
    l.sale = add(l.sale, f.sale); l.cost = add(l.cost, f.cost); l.profit = add(l.profit, f.profit);
  }
  for (const row of latest) {
    const l = line(String(row.phone_key || ""));
    l.balance = kyat(row.new_balance);
    l.balanceAt = row.occurred_at ? new Date(row.occurred_at).toISOString() : null;
    l.balanceOrderId = String(row.sale_order_id || row.source_order_id || row.id);
  }
  const text = (n) => n === null ? null : signedUsd(n);
  return [...lines.values()].map((l) => {
    const figures = sheetFigures({ saleThb: text(l.sale), costThb: text(l.cost) });
    return { ...l, used: text(l.used), sale: text(l.sale), cost: text(l.cost), profit: text(l.profit), margin: figures.margin };
  }).sort((a, b) => (a.phone === "") - (b.phone === "") || b.orders - a.orders || a.phone.localeCompare(b.phone));
}

export function waveMatches(entry, term) {
  if (!term) return true;
  const d = entry.details;
  return [entry.orderId, d.game, d.pack, d.operator, d.invoice, d.customer, d.playerId, d.sheetOperator]
    .join(" ").toLowerCase().includes(term.toLowerCase());
}
