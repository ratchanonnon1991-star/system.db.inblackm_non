// Live, read-only view over the Oxide bot's MOL MultiGameCard pool.
// Unlike sky_gocash_history, there is no dedicated ledger *table* for this
// system — the bot just overwrites the current balance on each card in
// place in system_settings, so getPaymentData()/listCards() below can only
// ever return a live snapshot. There IS still a real per-order before/after
// reading though, just not in its own table: see the big comment on
// listOrdersForSerials for where it actually lives.
import { selectQuery } from "@/lib/profit-remote-db";

const SETTING_KEY = "oxide_payment_card";
const CACHE_MS = 5_000;
let cache = { at: 0, data: null };

function parseBalance(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// The comma-formatted point counters MOL's own page renders (e.g.
// "1,990") -- parseFloat alone stops at the first comma, so these need the
// separators stripped first.
function parsePoints(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Never expose a full redeemable card PIN in the dashboard — mask down to
// the first 2 and last 4 digits, enough to eyeball-match against the bot's
// own logs without it being usable on its own.
function maskPin(pin) {
  if (!pin) return "";
  const s = String(pin);
  if (s.length <= 6) return "*".repeat(s.length);
  return `${s.slice(0, 2)}${"*".repeat(s.length - 6)}${s.slice(-4)}`;
}

// Same convention as profit-gocash.js's normalizePlatform: the Telegram
// queue calls the Russia reseller channel "russia" instead of the
// "russia_reseller" tag codashop_orders.source uses directly -- collapse
// them so it isn't tracked as two separate platforms on the shared
// per-platform pack-price table.
const PLATFORM_ALIASES = { russia: "russia_reseller" };
function normalizePlatform(raw) {
  if (!raw) return null;
  return PLATFORM_ALIASES[raw] || raw;
}

async function getPaymentData() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;
  const rows = await selectQuery(
    "SELECT setting_value FROM system_settings WHERE setting_key = $1",
    [SETTING_KEY]
  );
  let parsed = { cards: [] };
  if (rows.length) {
    try {
      parsed = JSON.parse(rows[0].setting_value) || { cards: [] };
    } catch {
      parsed = { cards: [] };
    }
  }
  cache = { at: now, data: parsed };
  return parsed;
}

// codashop_orders has no index on phone_number, and it's a 180k+ row table —
// every lookup here is a full scan. Cache per distinct serial-set (list page
// vs a single card's detail page hit different sets) for the same window
// gocash uses, so the sidebar isn't paying for that scan on every click.
const ORDERS_CACHE_MS = 5_000;
let ordersCache = { key: null, at: 0, data: null };

// codashop_orders.phone_number is reused to hold the card serial that funded
// the order, but only for orders that actually completed. So this is a real,
// if incomplete, per-card usage trail: every successful deduction, just none
// of the attempts that failed before charging the card.
//
// There's no ledger table for this source (see the file header comment),
// but the redemption automation logs its own before/after read of the MOL
// page into codashop_orders.provider_response -> payment -> molGameCard for
// every completed order (confirmed live: 100% coverage across all 1,328
// completed orders on every currently active card). "remainingBalance" is
// the card's point balance immediately after that specific redemption
// (always identical to "points" in the same blob -- same reading, captured
// twice by the scraper); "redeemPoints" is what that pack actually cost in
// points. So old_balance = remaining + redeem is real per-order data, not a
// guess, and remainingBalance on a card's last order matches its live
// balance in system_settings for every card confirmed idle since (11/13
// sampled). The one thing it can't promise is a clean serial ledger across
// *different* orders the way sky_gocash_history can: several bot workers
// can redeem against the very same physical card within the same few
// seconds (confirmed: 4 workers/machine x several machines all sharing the
// same card pool), and each one's own reading is only ever a snapshot of
// whatever the page showed to *that* browser session -- correct for that
// order in isolation, but not guaranteed to chain onto the next order's
// reading when two race each other on the same card.
export async function listOrdersForSerials(serials) {
  const list = (serials || []).filter(Boolean);
  if (!list.length) return [];
  const key = [...list].sort().join(",");
  const now = Date.now();
  if (ordersCache.data && ordersCache.key === key && now - ordersCache.at < ORDERS_CACHE_MS) {
    return ordersCache.data;
  }
  const rows = await selectQuery(
    // Same COALESCE profit-gocash.js's getAllRows() uses: codashop_orders.source
    // only tags a minority of orders directly, the rest went through the
    // Telegram fulfillment queue whose own task record (telegram_orders_dev)
    // carries the platform instead. Neither is filled in for a chunk of the
    // "playerok-<uuid>" queue's own orders though (confirmed live: both
    // columns null on some of them) -- last resort, that queue's name is
    // baked directly into telegram_task_request_id's own prefix, so pull it
    // from there when the two real columns come up empty. A plain numeric
    // task id (the other queue) has no such prefix, so this only ever fires
    // for the playerok-style ids.
    `SELECT c.id, c.phone_number AS card_serial, c.pack_name, c.game_name,
            COALESCE(
              c.source,
              t.source,
              CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END
            ) AS platform,
            t.source AS telegram_source,
            t.order_id AS sale_order_id,
            t.price AS telegram_price, c.invoice_txn_id, c.created_at,
            c.provider_response->'payment'->'molGameCard'->>'redeemPoints' AS redeem_points,
            c.provider_response->'payment'->'molGameCard'->>'remainingBalance' AS remaining_balance_points
     FROM codashop_orders c
     LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
     WHERE c.phone_number = ANY($1) AND c.status = 'completed'
     ORDER BY c.created_at ASC`,
    [list]
  );
  const data = rows.map((r) => {
    const deductedPoints = parsePoints(r.redeem_points);
    const newBalancePoints = parsePoints(r.remaining_balance_points);
    const oldBalancePoints = deductedPoints != null && newBalancePoints != null ? newBalancePoints + deductedPoints : null;
    return {
      id: r.id,
      cardSerial: r.card_serial,
      packName: r.pack_name,
      gameName: r.game_name,
      // Per-order points ledger read straight from the redemption automation's
      // own capture of the MOL page -- see the big comment above this function
      // for how reliable this is (and isn't).
      oldBalancePoints,
      deductedPoints,
      newBalancePoints,
      // Which resale platform the order sold through -- see the COALESCE chain
      // above (real when present); untagged orders fall back to a manual pick
      // (see profit_oxide_overrides), same convention as GoCash.
      platform: normalizePlatform(r.platform),
      // Customer-facing ORDER ID from the Telegram fulfillment task --
      // distinct from this row's own id (the QUEUE #). Null when the
      // telegram_orders_dev join misses (rare for completed orders).
      saleOrderId: r.sale_order_id || null,
      // The payment gateway's own transaction id -- real dedup key (GoCash
      // dedupes on order_id the same way; this source has no order_id concept,
      // invoice_txn_id is codashop_orders' own equivalent).
      invoiceTxnId: r.invoice_txn_id,
      // What the fulfillment queue actually charged to top the order up --
      // real per-order cost, not a guess. Two currencies mixed in this one
      // column depending on which queue handled it (confirmed against the
      // team's own reference sheet): telegram_source "russia" is USD (matches
      // the USD price already embedded in most pack names); everything else
      // (the "playerok-..." task ids, telegram_source null) is already THB.
      // See oxideOrderView's cost priority for how this gets converted/used.
      telegramPrice: r.telegram_price != null ? Number(r.telegram_price) : null,
      telegramSource: r.telegram_source,
      createdAt: r.created_at,
      // Some pack names carry a leading "10.00 " USD price (Codashop's own
      // convention); most don't, so this is a best-effort figure, not exact.
      priceUsdApprox: parseLeadingUsd(r.pack_name),
    };
  });
  ordersCache = { key, at: now, data };
  return data;
}

function parseLeadingUsd(packName) {
  // Must have a decimal point — an integer prefix like "50 + 5 WEB BONUS" is
  // a points/coin quantity, not a price. Only "10.00 500 Coins ..." style
  // names are actually a Codashop USD price glued to the front.
  const m = /^(\d+\.\d+)\s+/.exec(packName || "");
  return m ? parseFloat(m[1]) : null;
}

// Distinct games actually topped up across every card, straight from
// codashop_orders.game_name (real per-order data -- see listOrdersForSerials)
// rather than a manually maintained tag list.
export async function listGameNames() {
  const cards = await listCards();
  const orders = await listOrdersForSerials(cards.map((c) => c.cardSerial));
  return [...new Set(orders.map((o) => o.gameName).filter(Boolean))].sort();
}

export async function listCards() {
  const data = await getPaymentData();
  const cards = data.cards || [];
  return cards.map((c, index) => ({
    index,
    cardSerial: c.cardSerial || null,
    cardPinMasked: maskPin(c.cardPin),
    balancePoints: parseBalance(c.balance),
    enabled: c.enabled !== false,
    balanceUpdatedAt: c.balanceUpdatedAt || null,
    slotIndex: c.slotIndex ?? null,
  }));
}
