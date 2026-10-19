import { inventoryError } from "./usdcodashop-inventory.js";
import { codaDateBounds } from "./usdcodashop-report.js";
import { sheetCents, sheetFigures } from "./usdcodashop-sheet.js";
import { signedUsd } from "./usdcodashop-ledger.js";
import { convertSaleThb } from "./usdcodashop-sale-conversion.js";

// Sheet references are not opening balances. They must never be mixed into bot balances.
export const NETEASE_ACCOUNTS = [
  ...[
    ["pay1", "inblacknetease@hotmail.com", "1127.61", "1127.08", "0.53"],
    ["pay2", "inblacknetease1@hotmail.com", "11.84", "0", "11.84"],
    ["pay3", "inblackother18@hotmail.com", "4213.99", "4209.50", "4.49"],
    ["pay4", "inblackother17@hotmail.com", "1659.02", "1655.97", "3.05"],
    ["pay5", "inblackother19@hotmail.com", "853.52", "837.50", "16.02"],
    ["pay6", "inblackother6@hotmail.com", "855.60", "854.20", "1.40"],
  ].map(([id, email, current, used, remaining]) => ({ id, email, name: `(USD) Netease Pay ${id.slice(-1)}`,
    currency: "USD", rate: "27.93", reference: { current, used, remaining } })),
  { id: "credit1", name: "(USD) Netease Credit 1", email: null, currency: "USD", rate: "33.48", reference: { current: "0.68", used: "0", remaining: "0.68" } },
  { id: "credit2", name: "(USD) Netease Credit 2", email: "inblacknetease1@hotmail.com", currency: "USD", rate: "32.48", reference: { current: "1409.28", used: "508.29", remaining: "900.99" } },
  { id: "krw1", name: "(KRW) Netease Pay 1", email: "neteasekrw@hotmail.com", currency: "KRW", divisor: "47.69", reference: null },
];
export const NETEASE_PAGE_SIZE = 100;
export const neteaseAccount = (id) => NETEASE_ACCOUNTS.find((a) => a.id === id);
export function neteaseFilters({ dateFrom, dateTo, account = "", search = "", page = 1, rates = "{}" } = {}) {
  if (!dateFrom || !dateTo) throw inventoryError("กรุณาเลือกช่วงวันที่");
  const bounds = codaDateBounds({ dateFrom, dateTo });
  if (Date.parse(bounds.end) - Date.parse(bounds.start) > 93 * 86400000) throw inventoryError("เลือกช่วงวันที่ได้ไม่เกิน 93 วัน");
  if (account && account !== "unmapped" && !neteaseAccount(account)) throw inventoryError("บัญชี Netease ไม่ถูกต้อง");
  let overrides;
  try { overrides = JSON.parse(String(rates)); } catch { throw inventoryError("เรทไม่ถูกต้อง"); }
  if (!overrides || Array.isArray(overrides) || typeof overrides !== "object") throw inventoryError("เรทไม่ถูกต้อง");
  for (const [id, rate] of Object.entries(overrides)) {
    if (!neteaseAccount(id) || !/^\d{1,6}(?:\.\d{1,8})?$/.test(String(rate)) || !(Number(rate) > 0)) throw inventoryError("เรทต้องเป็นตัวเลขมากกว่าศูนย์");
  }
  return { dateFrom, dateTo, bounds, account, search: String(search ?? "").trim().slice(0, 200),
    page: Number.isSafeInteger(Number(page)) && Number(page) > 0 && Number(page) <= 10000 ? Number(page) : 1, rates: overrides };
}
export const neteaseAmount = (v) => { const n = sheetCents(v); return n === null ? null : signedUsd(n); };
export function resolveNeteaseAccount(row) {
  const email = String(row.purchase_email || "").trim().toLowerCase();
  if (!email) return null;
  const currency = String(row.currency || "").trim().toUpperCase();
  const candidates = NETEASE_ACCOUNTS.filter((a) => a.email === email && (!currency || a.currency === currency));
  // Pay and Credit share an email. Neither game-name guesses nor wallet values
  // are a reliable identity: preserve these purchases as unassigned for review.
  return candidates.length === 1 ? candidates[0] : null;
}
export function neteaseUsage(row) {
  const before = sheetCents(row.old_balance), after = sheetCents(row.new_balance), debit = sheetCents(row.deducted);
  if (before !== null && after !== null) {
    if (before < after || (debit !== null && before - after !== debit)) return { used: null, conflict: true };
    return { used: signedUsd(before - after), conflict: false };
  }
  return { used: debit === null ? null : signedUsd(debit), conflict: false };
}
export function neteaseCost(used, account, rates = {}) {
  if (!account || used === null) return null;
  if (!account.divisor) return convertSaleThb(used, rates[account.id] ?? account.rate);
  const n = sheetCents(used), divisor = String(rates[account.id] ?? account.divisor);
  const [whole, fraction = ""] = divisor.split(".");
  const denominator = BigInt(whole + fraction), scale = 10n ** BigInt(fraction.length);
  return n === null || denominator <= 0n ? null : signedUsd((n * scale + denominator / 2n) / denominator);
}
export function neteaseOrder(row, rates = {}) {
  const account = resolveNeteaseAccount(row), usage = neteaseUsage(row);
  const details = { ...(row.sheet_fields || {}), costThb: neteaseCost(usage.used, account, rates),
    game: String(row.game_name || "").slice(0, 200), pack: String(row.pack_name || "").slice(0, 200),
    invoice: String(row.netease_order_no || "").slice(0, 200), operator: String(row.operator || "Bot").slice(0, 160) };
  return { id: String(row.history_id), codaId: String(row.id), account: account?.id || "unmapped",
    // Without a wallet identity even two receipts for one customer order may
    // debit different wallets. Keep them separate instead of fabricating a combined balance.
    walletKey: account?.id || `unmapped:${row.history_id}`,
    email: String(row.purchase_email || "").trim().toLowerCase(), currency: account?.currency || row.currency || null,
    orderId: String(row.sale_order_id || row.source_base || row.source_order_id || row.id),
    source: String(row.source || row.telegram_source || "").toLowerCase(),
    occurredAt: new Date(row.occurred_at).toISOString(), balance: neteaseAmount(row.new_balance),
    observedAt: new Date(row.balance_received_at || row.occurred_at).toISOString(), ...usage, details, figures: sheetFigures(details) };
}
function total(entries, get) {
  let sum = 0n;
  for (const e of entries) { const n = sheetCents(get(e)); if (n === null) return null; sum += n; }
  return signedUsd(sum);
}
export const neteaseTotalUsage = (entries) => total(entries, (e) => e.used);
export function groupNeteaseOrders(entries, rates = {}) {
  const groups = new Map();
  for (const e of entries) { const key = JSON.stringify([e.walletKey, e.source, e.orderId]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e); }
  return [...groups.values()].map((fills) => {
    fills.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || Number(a.id) - Number(b.id));
    const first = fills[0], latest = [...fills].sort((a, b) => b.observedAt.localeCompare(a.observedAt) || Number(b.id) - Number(a.id))[0];
    const used = total(fills, (e) => e.used);
    const distinct = (key) => [...new Set(fills.map((e) => e.details[key]).filter(Boolean))].join(" + ");
    const fullPayments = new Set(fills.map((e) => e.details.saleTotalThb));
    const details = { ...first.details, saleThb: fullPayments.size > 1 ? null : total(fills, (e) => e.figures.sale),
      costThb: neteaseCost(used, neteaseAccount(first.account), rates), game: distinct("game"), pack: distinct("pack"), invoice: distinct("invoice") };
    return { ...first, used, balance: latest.balance, observedAt: latest.observedAt,
      conflict: fills.some((e) => e.conflict), fillCount: fills.length, fills, details, figures: sheetFigures(details) };
  });
}
export function neteaseSummary(entries) {
  const sale = total(entries, (e) => e.figures.sale), cost = total(entries, (e) => e.figures.cost);
  return { orders: entries.length, fills: entries.reduce((n, e) => n + e.fillCount, 0), ...sheetFigures({ saleThb: sale, costThb: cost }),
    missingSales: entries.filter((e) => e.figures.sale === null).length, missingCosts: entries.filter((e) => e.figures.cost === null).length };
}
export const neteaseMatches = (e, search) => !search || [e.orderId, e.email, neteaseAccount(e.account)?.name,
  ...Object.values(e.details).filter((v) => typeof v === "string")].join(" ").toLowerCase().includes(search.toLowerCase());
export function neteaseCsv(entries) {
  const quote = (v, numeric = false) => { let s = v == null ? "" : String(v); if (!(numeric && /^-?\d+(?:\.\d+)?$/.test(s)) && /^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
  const rows = [["วันที่ (ไทย)", "Order", "บัญชี", "สกุลเงิน", "ยอดโอน THB", "ต้นทุน THB", "กำไร THB", "กำไร %", "ยอดออก", "คงเหลือจากบอท", "เกม", "แพ็ก", "เลขธุรกรรม", "จำนวนรายการย่อย", "อีเมล"]];
  for (const e of entries) rows.push([new Date(e.occurredAt).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }), e.orderId,
    neteaseAccount(e.account)?.name || "ยังไม่ระบุ Pay/Credit", e.currency, e.figures.sale, e.figures.cost, e.figures.profit, e.figures.margin,
    e.used, e.balance, e.details.game, e.details.pack, e.details.invoice, e.fillCount, e.email]);
  return "\uFEFF" + rows.map((row, i) => row.map((v, c) => quote(v, i > 0 && c >= 4 && c <= 9)).join(",")).join("\r\n");
}
