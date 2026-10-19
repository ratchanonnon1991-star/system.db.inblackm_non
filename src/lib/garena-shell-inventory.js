import { inventoryError } from "./usdcodashop-inventory.js";
import { codaDateBounds } from "./usdcodashop-report.js";
import { sheetCents, sheetFigures } from "./usdcodashop-sheet.js";
import { signedUsd } from "./usdcodashop-ledger.js";

// Only these two usernames are inventory accounts. The bot's account index is not stable.
export const SHELL_ACCOUNTS = [
  { id: "inblackrb2c", username: "InblackRB2c", name: "InblackShell1 (InblackRB2c)", owner: "ผู้ลงรายการ",
    reference: { current: "161935.00", used: "37885.00", remaining: "124050.00", status: "ปกติ" } },
  { id: "inblackwfh1z", username: "InblackWFH1z", name: "InblackShell2 (InblackWFH1z)", owner: "Art",
    reference: { current: "359730.00", used: "330825.00", remaining: "28905.00", status: "ปกติ" } },
];
export const SHELL_METHOD = "GarenaShells";
export const SHELL_COST_PER_UNIT = "0.625";
export const SHELL_PAGE_SIZE = 100;
export const SHELL_MAX_ORDERS = 20000;
export const shellAccount = (value) => SHELL_ACCOUNTS.find((account) => account.id === String(value ?? "").trim().toLowerCase()) || null;

export function shellFilters({ dateFrom, dateTo, account = "", search = "", page = 1 } = {}) {
  if (!dateFrom || !dateTo) throw inventoryError("กรุณาเลือกช่วงวันที่");
  const bounds = codaDateBounds({ dateFrom, dateTo });
  if (new Date(bounds.end) - new Date(bounds.start) > 93 * 86400000) throw inventoryError("เลือกช่วงวันที่ได้ไม่เกิน 93 วัน");
  const selected = String(account ?? "").trim().toLowerCase();
  if (selected && !shellAccount(selected)) throw inventoryError("เลือกได้เฉพาะสองบัญชี Garena Shell ที่กำหนด");
  const pageNumber = Number(page);
  return { dateFrom, dateTo, bounds, account: selected, search: String(search ?? "").trim().slice(0, 200),
    page: Number.isSafeInteger(pageNumber) && pageNumber > 0 && pageNumber <= 10000 ? pageNumber : 1 };
}

export function shellAmount(value) {
  const cents = sheetCents(value);
  return cents === null ? null : signedUsd(cents);
}

export function shellUsage(row) {
  const before = sheetCents(row.shell_before), after = sheetCents(row.shell_after);
  const reported = sheetCents(row.shell_used);
  if (before !== null && after !== null) {
    if (before < after || (reported !== null && reported !== before - after)) return { used: null, usageSource: "conflict" };
    return { used: signedUsd(before - after), usageSource: "balances" };
  }
  return { used: reported === null ? null : signedUsd(reported), usageSource: reported === null ? null : "shell_used" };
}

export function shellCost(amount) {
  const cents = sheetCents(amount);
  return cents === null ? null : signedUsd((cents * 625n + 500n) / 1000n);
}

// Allocate a full customer payment deterministically, including remainder satang.
// This keeps 100.01 / 3 from becoming 100.02 when the packets are combined again.
export function allocateShellSale(details) {
  const total = sheetCents(details.saleThb);
  const { count = 1, position = 0 } = details.saleAllocation || {};
  const valid = Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(position) && position >= 0 && position < count;
  const amount = total !== null && valid
    ? signedUsd(total / BigInt(count) + (BigInt(position) < total % BigInt(count) ? 1n : 0n)) : null;
  return { ...details, saleTotalThb: total === null ? null : signedUsd(total), saleThb: amount,
    ...(count > 1 ? { salePacks: count } : {}) };
}

export function shellOrder(row) {
  const account = shellAccount(row.garena_username);
  if (!account) return null;
  const usage = shellUsage(row);
  const details = { ...(row.sheet_fields || {}), costThb: shellCost(usage.used),
    game: String(row.game_name || "").slice(0, 200), pack: String(row.pack_name || "").slice(0, 200),
    operator: String(row.operator || "Bot").slice(0, 160), invoice: String(row.invoice_number || "").slice(0, 200) };
  return { id: String(row.id), account: account.id, saleSource: String(row.source || row.telegram_source || "").trim().toLowerCase(),
    orderId: String(row.sale_order_id || row.source_base || row.source_order_id || row.id),
    occurredAt: new Date(row.occurred_at).toISOString(), balance: shellAmount(row.shell_after ?? row.shell_balance),
    observedAt: new Date(row.observed_at || row.occurred_at).toISOString(),
    ...usage, details, figures: sheetFigures(details) };
}

function totalAmount(entries, get) {
  let cents = 0n;
  for (const entry of entries) {
    const amount = sheetCents(get(entry));
    if (amount === null) return null;
    cents += amount;
  }
  return signedUsd(cents);
}

// One customer order per account/channel. Preserve /1 versus /2 and every underlying fill.
export function groupShellOrders(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = JSON.stringify([entry.account, entry.saleSource, entry.orderId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.values()].map((members) => {
    const ordered = [...members].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || Number(a.id) - Number(b.id));
    const first = ordered[0];
    const latest = [...members].sort((a, b) => (b.observedAt || b.occurredAt).localeCompare(a.observedAt || a.occurredAt) || Number(b.id) - Number(a.id))[0];
    const used = totalAmount(members, (member) => member.used);
    const fullPayments = new Set(members.map((member) => member.details.saleTotalThb));
    const sale = fullPayments.size > 1 ? null : totalAmount(members, (member) => member.figures.sale);
    const distinct = (key) => [...new Set(ordered.map((member) => member.details[key]).filter(Boolean))].join(" + ");
    const details = { ...first.details, saleThb: sale, costThb: shellCost(used),
      game: distinct("game"), pack: distinct("pack"), operator: distinct("operator"), sheetOperator: distinct("sheetOperator"),
      invoice: distinct("invoice"), customer: distinct("customer"), playerId: distinct("playerId"),
      shellBreakdown: ordered.map((member) => member.used ?? "—").join(" + "),
      ...(fullPayments.size > 1 ? { saleAmbiguous: true } : {}) };
    return { ...first, used, balance: latest.balance, observedAt: latest.observedAt,
      usageSource: ordered.every((member) => member.usageSource === "balances") ? "balances" : used === null ? "conflict" : "shell_used",
      details, figures: sheetFigures(details), fillCount: members.length, fills: ordered };
  });
}

export function shellSummary(entries) {
  const total = (get) => {
    let sum = 0n;
    for (const entry of entries) {
      const value = get(entry), cents = sheetCents(value);
      if (cents === null) return null;
      sum += cents;
    }
    return signedUsd(sum);
  };
  const sale = total((e) => e.figures.sale), cost = total((e) => e.figures.cost);
  const figures = sheetFigures({ saleThb: sale, costThb: cost });
  return { orders: entries.length, fills: entries.reduce((sum, entry) => sum + (entry.fillCount || 1), 0), used: total((e) => e.used), ...figures,
    missingSales: entries.filter((e) => e.figures.sale === null).length,
    missingCosts: entries.filter((e) => e.figures.cost === null).length };
}

export function shellMatches(entry, search) {
  return !search || [entry.orderId, shellAccount(entry.account)?.name,
    entry.details.game, entry.details.pack, entry.details.invoice, entry.details.operator,
    entry.details.sheetOperator, entry.details.customer, entry.details.playerId]
    .join(" ").toLowerCase().includes(search.toLowerCase());
}

export function shellCsv(entries) {
  const quote = (value, numeric = false) => {
    let text = value == null ? "" : String(value);
    if (!(numeric && /^-?\d+(?:\.\d+)?$/.test(text)) && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [["วันที่ (ไทย)", "ลำดับคิว", "บัญชี", "ยอดโอน (THB)", "ต้นทุน (THB)", "กำไร (THB)", "กำไร (%)", "Shell ออก", "Shell คงเหลือ (บอท)", "เกม", "แพ็ก", "ผู้เติม", "เลขธุรกรรม", "จำนวนรายการย่อย", "Shell แยกรายการย่อย"]];
  for (const e of entries) rows.push([new Date(e.occurredAt).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }),
    e.orderId, shellAccount(e.account)?.name, e.figures.sale, e.figures.cost, e.figures.profit, e.figures.margin,
    e.used, e.balance, e.details.game, e.details.pack, e.details.sheetOperator || e.details.operator, e.details.invoice,
    e.fillCount || 1, e.details.shellBreakdown || e.used]);
  return "\uFEFF" + rows.map((row, index) => row.map((value, column) => quote(value, index > 0 && column >= 3 && column <= 8)).join(",")).join("\r\n");
}
