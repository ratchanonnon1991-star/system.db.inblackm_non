// Live, read-only view over sky_gocash_history (owned by the thatsky-main bot).
// card_serial is the real card identity — slot_index is just which physical
// USB slot happened to hold the card at the time, and gets reused by many
// different cards over the card's lifetime (confirmed: 196 distinct serials
// across only 20 slots, and every serial maps to exactly one slot, never the
// reverse). Grouping by slot instead of serial silently merges the history
// of many unrelated cards into one row.
import { selectQuery } from "@/lib/profit-remote-db";

export const FACE_VALUE = 100;
// Below this, no real pack can ever be cut from the card again — it's dead
// weight that needs to be cleared out by hand.
export const DUST_THRESHOLD = 1;
const CACHE_MS = 5_000;
let cache = { at: 0, rows: null };

// codashop_orders.source only tags ~30% of orders directly (kaleoz, PAGE,
// inblackm_web, russia_reseller) -- the rest come in through the Telegram
// bot queue instead, whose task record (telegram_orders_dev, joined via
// codashop_orders.telegram_task_request_id) carries its own source column
// for those. Together the two cover every sky_gocash_history row (confirmed:
// 100% join coverage on order_id -> codashop_orders.id, timestamps line up
// within ~1 minute of each other). The Telegram queue calls the same Russia
// reseller channel "russia" instead of "russia_reseller" -- normalizePlatform
// collapses that so it isn't tracked as two separate platforms downstream.
const PLATFORM_ALIASES = { russia: "russia_reseller" };
function normalizePlatform(raw) {
  if (!raw) return null;
  return PLATFORM_ALIASES[raw] || raw;
}

export async function getAllRows() {
  const now = Date.now();
  if (cache.rows && now - cache.at < CACHE_MS) return cache.rows;
  const rows = await selectQuery(
    `SELECT h.id, h.card_serial, h.slot_index, h.old_balance, h.deducted, h.new_balance,
            h.order_id, t.order_id AS sale_order_id, h.pack_name, h.created_at,
            COALESCE(c.source, t.source) AS platform
     FROM sky_gocash_history h
     LEFT JOIN codashop_orders c ON c.id = h.order_id
     LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
     ORDER BY h.created_at ASC`
  );
  const shaped = rows.map((r) => ({
    id: r.id,
    cardSerial: r.card_serial,
    slotIndex: r.slot_index == null ? null : Number(r.slot_index),
    oldBalance: parseFloat(r.old_balance),
    deducted: parseFloat(r.deducted),
    newBalance: parseFloat(r.new_balance),
    // sky_gocash_history.order_id = codashop_orders.id -- the internal queue
    // number shown as QUEUE #. The customer-facing ORDER ID lives on the
    // Telegram task instead (telegram_orders_dev.order_id).
    orderId: r.order_id,
    saleOrderId: r.sale_order_id || null,
    packName: r.pack_name,
    createdAt: r.created_at,
    platform: normalizePlatform(r.platform),
  }));
  cache = { at: now, rows: shaped };
  return shaped;
}

export function cardKey(cardSerial, slotIndex) {
  return cardSerial || `slot:${slotIndex == null ? "none" : slotIndex}`;
}

function remainingOnCard(rows) {
  if (!rows.length) return FACE_VALUE;
  const last = rows[rows.length - 1];
  const remaining = Number(last.newBalance);
  if (!Number.isFinite(remaining)) return FACE_VALUE;
  return Math.round(Math.max(0, Math.min(FACE_VALUE, remaining)) * 100) / 100;
}

function deductedOnCard(rows) {
  return Math.round((FACE_VALUE - remainingOnCard(rows)) * 100) / 100;
}

export async function listCards() {
  const rows = await getAllRows();
  const byCard = new Map();
  for (const r of rows) {
    const key = cardKey(r.cardSerial, r.slotIndex);
    if (!byCard.has(key)) byCard.set(key, []);
    byCard.get(key).push(r);
  }
  return [...byCard.entries()]
    .map(([key, list]) => ({
      cardKey: key,
      cardSerial: list[0]?.cardSerial || null,
      slotIndex: list[list.length - 1]?.slotIndex ?? null,
      orderCount: list.length,
      remaining: remainingOnCard(list),
      deductedTotal: deductedOnCard(list),
      firstOrderAt: list[0]?.createdAt,
      lastOrderAt: list[list.length - 1]?.createdAt,
      rows: list,
    }))
    .sort((a, b) => new Date(b.lastOrderAt || 0) - new Date(a.lastOrderAt || 0));
}

export async function listHistoryForCard(key) {
  const rows = await getAllRows();
  const target = String(key);
  return rows.filter((r) => cardKey(r.cardSerial, r.slotIndex) === target);
}
