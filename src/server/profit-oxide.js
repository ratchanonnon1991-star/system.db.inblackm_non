// Live, read-only view over the Oxide bot's MOL MultiGameCard pool.
// Unlike sky_gocash_history, there is no per-order deduction ledger for this
// system — the bot just overwrites the current balance on each card in place.
// So this can only ever be a live snapshot: current balance per card, not an
// order history.
import { selectQuery } from "@/lib/profit-remote-db";

const SETTING_KEY = "oxide_payment_card";
const CACHE_MS = 5_000;
let cache = { at: 0, data: null };

function parseBalance(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
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
export async function listOrdersForSerials(serials) {
  const list = (serials || []).filter(Boolean);
  if (!list.length) return [];
  const key = [...list].sort().join(",");
  const now = Date.now();
  if (ordersCache.data && ordersCache.key === key && now - ordersCache.at < ORDERS_CACHE_MS) {
    return ordersCache.data;
  }
  const rows = await selectQuery(
    `SELECT id, phone_number AS card_serial, pack_name, game_name, created_at
     FROM codashop_orders
     WHERE phone_number = ANY($1) AND status = 'completed'
     ORDER BY created_at ASC`,
    [list]
  );
  const data = rows.map((r) => ({
    id: r.id,
    cardSerial: r.card_serial,
    packName: r.pack_name,
    gameName: r.game_name,
    createdAt: r.created_at,
    // Some pack names carry a leading "10.00 " USD price (Codashop's own
    // convention); most don't, so this is a best-effort figure, not exact.
    priceUsdApprox: parseLeadingUsd(r.pack_name),
  }));
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
