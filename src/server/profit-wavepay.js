// Live, read-only view over WavePay-funded orders inside the shared
// codashop_orders table (payment_method = 'WavePay'). WavePay is a Myanmar
// mobile wallet the shop tops up games through directly via API (not a
// pre-loaded card the way GoCash/Oxide are) -- codashop_orders.phone_number
// here is the WavePay account number itself, and several different games'
// bots draw down the SAME shared account (confirmed live: system_settings
// carries one "<game>_wave_balance_switch_threshold_ks" key per game, all
// watching the same pool of accounts to know when to switch to the next
// one) -- so "card" below means one WavePay account, not one game, same
// idea as Oxide's shared card pool.
import { selectQuery } from "@/lib/profit-remote-db";

// Kyat amounts come back as either a plain numeric string (balances) or
// "Ks11,000" (pack_price) -- strip everything but digits/dot/minus so both
// parse the same way.
function parseKyat(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const CACHE_MS = 5_000;
let cache = { at: 0, data: null };

// Same convention as profit-gocash.js / profit-oxide.js: the Telegram queue
// calls the Russia reseller channel "russia" instead of the
// "russia_reseller" tag used on sale-price sheets -- collapse them so it
// isn't tracked as two separate platforms.
const PLATFORM_ALIASES = { russia: "russia_reseller" };

// telegram_orders_dev.source_group is the Telegram *chat title*, not a
// platform tag -- most Russia-queue WavePay orders have source null and a
// numeric task id (so the prefix fallback never fires), but the chat they
// came from still names the reseller. Map those known titles onto the
// same platform ids the rest of Profit already uses; anything else (internal
// Thai ops chats like "แจ้งคิวตกค้าง") stays untagged rather than polluting
// the platform list with a one-off chat name.
const SOURCE_GROUP_ALIASES = {
  kaleoz: "kaleoz",
  itemku: "itemku",
  "russia reseller": "russia_reseller",
  "uid russian order": "russia_reseller",
  "order russia inblackm": "russia_reseller",
  "logovo logov | orderito bot": "russia_reseller",
  "via 2fa (russian resellers)": "russia_reseller",
  "donatov.net (russia) x inblackm talk and topup": "russia_reseller",
};

function normalizePlatform(raw) {
  if (!raw) return null;
  return PLATFORM_ALIASES[raw] || raw;
}

function platformFromSourceGroup(group) {
  if (!group) return null;
  return SOURCE_GROUP_ALIASES[String(group).trim().toLowerCase()] || null;
}

// codashop_orders has no index on payment_method any more than it does on
// phone_number (see profit-oxide.js's listOrdersForSerials) -- every call
// here is a full scan of a 190k+ row table, so this is cached the same way.
export async function getAllRows() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;
  const rows = await selectQuery(
    // Same COALESCE chain profit-oxide.js's listOrdersForSerials uses:
    // codashop_orders.source is 100% null for WavePay (confirmed live), so
    // the real tag lives on telegram_orders_dev.source (~16k "russia" rows)
    // or, failing that, the letter-prefix of telegram_task_request_id
    // (kaleoz- / PAGE- / itemku-). Numeric task ids have no prefix -- those
    // fall through to source_group mapping in JS below.
    `SELECT c.id, c.phone_number AS account, c.pack_name, c.pack_price, c.game_name,
            c.invoice_txn_id, c.created_at,
            COALESCE(
              c.source,
              t.source,
              CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END
            ) AS platform,
            t.source_group AS telegram_source_group,
            t.order_id AS sale_order_id,
            c.provider_response->'balances'->>'oldBalance' AS old_balance,
            c.provider_response->'balances'->>'newBalance' AS new_balance
     FROM codashop_orders c
     LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
     WHERE c.payment_method = 'WavePay' AND c.status = 'completed' AND c.phone_number IS NOT NULL
     ORDER BY c.created_at ASC`
  );
  const data = rows.map((r) => {
    const oldBalance = parseKyat(r.old_balance);
    const newBalance = parseKyat(r.new_balance);
    return {
      id: r.id,
      account: r.account,
      packName: r.pack_name,
      packPriceKs: parseKyat(r.pack_price),
      gameName: r.game_name,
      invoiceTxnId: r.invoice_txn_id,
      createdAt: r.created_at,
      platform: normalizePlatform(r.platform) || platformFromSourceGroup(r.telegram_source_group),
      // Customer-facing ORDER ID from the Telegram fulfillment task --
      // distinct from this row's own id (the QUEUE #).
      saleOrderId: r.sale_order_id || null,
      // Real per-order points... well, Kyat, ledger straight off the
      // wallet API's own response (payment.balances in the raw log) --
      // "deducted" is derived from the pair, not pack_price, since the
      // pair is the authoritative before/after read for that specific
      // call. Only ~86% of completed orders carry it (some older/failed-
      // then-retried rows never got a fresh balances read) -- null when
      // absent rather than falling back to pack_price, so a UI showing
      // this can tell "we don't know" apart from "zero".
      oldBalance,
      newBalance,
      deducted: oldBalance != null && newBalance != null ? Math.round((oldBalance - newBalance) * 100) / 100 : null,
    };
  });
  cache = { at: now, data };
  return data;
}

export function accountKey(account) {
  return account || "unknown";
}

export async function listAccounts() {
  const rows = await getAllRows();
  const byAccount = new Map();
  for (const r of rows) {
    const key = accountKey(r.account);
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(r);
  }
  return [...byAccount.entries()]
    .map(([key, list]) => ({
      account: key,
      orderCount: list.length,
      // Best-effort "current" balance -- unlike Oxide there's no live
      // snapshot table for WavePay accounts (no equivalent of
      // system_settings' oxide_payment_card), so the most recent
      // completed order's own newBalance reading is the closest thing to
      // one. Same caveat as the per-order ledger: several games' bots can
      // hit the same account within seconds of each other, so this is
      // occasionally a stale read rather than the true live figure.
      lastBalanceKs: list[list.length - 1]?.newBalance ?? null,
      firstOrderAt: list[0]?.createdAt,
      lastOrderAt: list[list.length - 1]?.createdAt,
    }))
    .sort((a, b) => new Date(b.lastOrderAt || 0) - new Date(a.lastOrderAt || 0));
}

export async function listOrdersForAccounts(accounts) {
  const set = new Set((accounts || []).filter(Boolean));
  if (!set.size) return [];
  const rows = await getAllRows();
  return rows.filter((r) => set.has(r.account));
}

// Distinct games actually topped up through WavePay, straight from
// codashop_orders.game_name (real per-order data, e.g. "Love and
// Deepspace" / "Harry Potter: Magic Awakened" / "The Division
// Resurgence" / "ZEPETO") -- same convention as profit-oxide.js's
// listGameNames, no hand-maintained tag list needed.
export async function listGameNames() {
  const rows = await getAllRows();
  return [...new Set(rows.map((r) => r.gameName).filter(Boolean))].sort();
}
