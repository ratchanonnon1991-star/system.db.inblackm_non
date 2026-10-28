// How each provider's bot data becomes receipts for the chain check. Pure.
// Every function here only reshapes rows the existing inventory pages already
// read; usage rules stay in each provider's own module.
import { accountKey } from "./inventory-ledger.js";
import { razerWalletKey, razerEmail } from "./razer-inventory.js";
import { resolveNeteaseAccount, NETEASE_ACCOUNTS } from "./netease-inventory.js";
import { kyat, waveUsage, waveShortBalance, WAVE_NOT_CHARGED_CODE, WAVEPAY_START_DATE } from "./wavepay-inventory.js";
import { shellAccount } from "./garena-shell-inventory.js";
import { dsUsed } from "./donshop-inventory.js";

export const LEDGER_CHECK_PROVIDERS = Object.freeze(["razer", "netease", "wavepay", "garena-shell", "gamepoint", "plsbuy", "donshop"]);

// codashop_orders rows: loaders select `started_at` = when the bot took the queue
// (fill_started_at, else created_at), as an exact instant. Chains follow it.
const startOf = row => row.started_at ?? row.occurred_at;

/** Order id a person would type for a bot row. */
// Rows without a customer order id are named by queue id, the way the Donshop page names them.
export const receiptRef = (row, fallbackId) => String(row.source_base || row.source_order_id || `#${fallbackId}`);
const lower = value => String(value ?? "").trim().toLowerCase();
const plusMs = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString();

// ---- Razer: razer_purchase_history, one wallet per e-mail + currency
export const razerLedgerKey = (email, zone) => accountKey("razer", razerWalletKey(email, String(zone || "").toUpperCase()));
export function razerWallet(row) {
  const email = razerEmail(row.purchase_email), zone = String(row.currency_code || "").toUpperCase();
  if (!email || !zone) return null;
  return { key: razerLedgerKey(email, zone), label: email, currency: zone };
}
export const razerReceipt = row => ({
  ref: receiptRef(row, row.history_id), startAt: row.occurred_at, endAt: row.balance_received_at ?? row.completed_at ?? null,
  before: row.old_balance_gold, after: row.new_balance_gold, spent: row.deducted,
});

// ---- Netease: netease_purchase_history; a wallet only when its e-mail names exactly one
export function neteaseWallet(row) {
  const email = lower(row.purchase_email), currency = String(row.currency || "").trim().toUpperCase();
  if (!email) return null;
  const account = resolveNeteaseAccount(row);
  if (account) return { key: accountKey("netease", account.id), label: account.name, currency: account.currency };
  const shared = NETEASE_ACCOUNTS.filter(a => a.email === email).length > 1;
  return {
    key: accountKey("netease", `${email}:${currency || "?"}`), label: email, currency: currency || null,
    // Two wallets behind one e-mail interleave their balances: a chain would invent gaps.
    uncheckable: shared ? "อีเมลนี้ใช้ร่วมกันหลายกระเป๋า (Pay/Credit) แยกไม่ได้ว่าใบไหนของกระเป๋าไหน" : null,
  };
}
export const neteaseReceipt = row => ({
  ref: receiptRef(row, row.history_id), startAt: row.occurred_at, endAt: row.balance_received_at ?? null,
  before: row.old_balance, after: row.new_balance, spent: row.deducted,
});

// ---- WavePay: codashop_orders, one wallet per SIM; provider_response.balances is the wallet's own read
export function waveWallet(row) {
  const phone = String(row.phone_key || "");
  if (!phone) return null;
  return { key: accountKey("wavepay", phone), label: phone, currency: "MMK" };
}
export function waveReceipt(row) {
  const before = kyat(row.old_balance), after = kyat(row.new_balance);
  if (before == null && after == null && row.bot_error_code === WAVE_NOT_CHARGED_CODE) {
    // The bot read the balance, found it short and paid nothing: a real reading, no spend.
    return { ref: receiptRef(row, row.id), startAt: startOf(row), endAt: null, before: waveShortBalance(row.bot_error_message), after: null, spent: "0" };
  }
  // Same usage rule as the WavePay page (pack price only as a fallback; a failed bot fill is unknown).
  return { ref: receiptRef(row, row.id), startAt: startOf(row), endAt: null, before, after,
    spent: before != null && after != null ? null : waveUsage(row).usedMmk };
}
export const waveQuote = row => kyat(row.pack_price);
export const WAVE_CHECK_START = `${WAVEPAY_START_DATE}T00:00:00+07:00`;

// ---- Garena Shell: codashop_orders, the two inventory usernames only
export function shellWallet(row) {
  const account = shellAccount(row.garena_username);
  return account ? { key: accountKey("garena-shell", account.id), label: account.name, currency: "SHELL" } : null;
}
export const shellReceipt = row => ({
  // updated_at can move long after the purchase (edits, retries), so it is not used as the "after" time.
  ref: receiptRef(row, row.id), startAt: startOf(row), endAt: null,
  before: row.shell_before, after: row.shell_after ?? row.shell_balance, spent: row.shell_used,
});

// ---- Gamepoint: one MYR wallet. Each fill saved the balance read just before submitting.
export const GAMEPOINT_WALLET = Object.freeze({ key: accountKey("gamepoint", "MYR"), label: "Gamepoint MYR", currency: "MYR" });
export function gamepointReceipts(entries) {
  return entries.flatMap(e => e.fills ?? [e]).map(f => ({
    // startedAt is set by the loader from the DB (exact instant); occurredAt from the page may be zone-shifted.
    ref: f.orderId, startAt: f.observation?.checkedAt ?? f.startedAt ?? f.occurredAt, endAt: null,
    before: f.observation?.before ?? null, after: null, spent: f.used,
  }));
}

// ---- Plsbuy: one MYR wallet. Newer fills carry the API read before/after the purchase.
export const PLSBUY_WALLET = Object.freeze({ key: accountKey("plsbuy", "MYR"), label: "Plsbuy MYR", currency: "MYR" });
export function plsbuyReceipts(entries) {
  return entries.flatMap(e => e.fills ?? [e]).map(f => f.wallet
    ? { ref: f.orderId, startAt: plusMs(f.wallet.checkedAt, -1), endAt: f.wallet.checkedAt, before: f.wallet.before, after: f.wallet.amount, spent: f.used }
    : { ref: f.orderId, startAt: f.startedAt ?? f.occurredAt, endAt: null, before: null, after: null, spent: f.used });
}

// ---- Donshop: one IDR wallet; bot-run rows only. balance_before is read when the bot takes the queue.
export const DONSHOP_WALLET = Object.freeze({ key: accountKey("donshop", "IDR"), label: "Donshop IDR", currency: "IDR" });
export const donshopReceipt = row => ({
  ref: receiptRef(row, row.id), startAt: startOf(row), endAt: null, before: row.balance_before, after: null, spent: dsUsed(row),
});
export const donshopQuote = row => dsUsed(row);

/** Rows -> wallets with receipts and non-completed hints. */
export function groupWallets(rows, { wallet, receipt, quote = () => null, completed = r => r.status == null || r.status === "completed" }) {
  const wallets = new Map();
  let unplaced = 0;
  for (const row of rows) {
    const w = wallet(row);
    if (!w) { unplaced++; continue; }
    if (!wallets.has(w.key)) wallets.set(w.key, { ...w, receipts: [], hints: [] });
    const target = wallets.get(w.key);
    if (completed(row)) target.receipts.push(receipt(row));
    // Did not complete but may still have taken money: shown next to a gap, never counted.
    else target.hints.push({ at: startOf(row), status: String(row.status), ref: receipt(row).ref, amount: quote(row) });
  }
  return { wallets: [...wallets.values()].sort((a, b) => a.key.localeCompare(b.key)), unplaced };
}
