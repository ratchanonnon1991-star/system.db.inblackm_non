// Live, read-only view over Agen H2H IDR API orders inside codashop_orders
// (payment_method = 'AgenH2HIDR'). Same shape as DonShop: H2H top-up API,
// phone_number always null, "card" = one game (group by game_name).
//
// Wallet ledger (IDR) from provider_response._worker_meta:
//   balance_before   → ก่อนตัด
//   live_cost_total  → ยอดตัด (falls back to live_cost × qty, then data.total)
// newBalance = balance_before − deducted.
// Note: balance_after is often written as 0 on live rows — ignore it.
import { selectQuery } from "@/lib/profit-remote-db";

function parseIdr(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const CACHE_MS = 5_000;
let cache = { at: 0, data: null };

const PLATFORM_ALIASES = { russia: "russia_reseller" };

// telegram_orders_dev.source_group is the Telegram chat title. AgenH2H often
// stores codashop_orders.source = 'telegram' (the queue channel), not the
// resale platform — those Russia-queue rows live in "UID RUSSIAN ORDER" and
// must land on russia_reseller (USDT Russia), same as Wavepay/U9.
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

function resolvePlatform(raw, sourceGroup) {
  const fromGroup = platformFromSourceGroup(sourceGroup);
  const normalized = normalizePlatform(raw);
  // "telegram" is the fulfillment channel, not Kaleoz/PAGE/Russia — prefer
  // the chat-title map; Thai ops chats stay untagged rather than showing
  // a fake "telegram" platform.
  if (!normalized || normalized === "telegram") return fromGroup;
  return normalized;
}

export function gameKey(gameName) {
  return gameName || "unknown";
}

export async function getAllRows() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;
  const rows = await selectQuery(
    `SELECT c.id, c.pack_name, c.pack_price, c.game_name, c.created_at,
            COALESCE(
              c.source,
              t.source,
              CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END
            ) AS platform,
            t.source_group AS telegram_source_group,
            t.source AS telegram_source,
            t.price AS telegram_price,
            t.order_id AS sale_order_id,
            c.provider_response->'data'->>'invoice' AS invoice_number,
            c.provider_response->'data'->>'ref_id' AS ref_id,
            c.provider_response->'data'->>'total' AS data_total,
            c.provider_response->'data'->>'serial_number' AS serial_number,
            c.provider_response->'_worker_meta'->>'balance_before' AS balance_before,
            c.provider_response->'_worker_meta'->>'live_cost_total' AS live_cost_total,
            c.provider_response->'_worker_meta'->>'live_cost' AS live_cost,
            c.provider_response->'_worker_meta'->>'quantity' AS quantity
     FROM codashop_orders c
     LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
     WHERE c.payment_method = 'AgenH2HIDR' AND c.status = 'completed'
     ORDER BY c.created_at ASC`
  );
  const data = rows.map((r) => {
    const oldBalanceIdr = parseIdr(r.balance_before);
    const liveTotal = parseIdr(r.live_cost_total);
    const liveCost = parseIdr(r.live_cost);
    const qty = Math.max(1, parseIdr(r.quantity) || 1);
    const dataTotal = parseIdr(r.data_total);
    const deductedIdr = liveTotal ?? (liveCost != null ? liveCost * qty : null) ?? dataTotal;
    const newBalanceIdr =
      oldBalanceIdr != null && deductedIdr != null
        ? Math.round(oldBalanceIdr - deductedIdr)
        : null;
    return {
      id: r.id,
      gameName: r.game_name,
      packName: r.pack_name,
      packPriceIdr: parseIdr(r.pack_price),
      oldBalanceIdr,
      deductedIdr,
      newBalanceIdr,
      platform: resolvePlatform(r.platform, r.telegram_source_group),
      telegramSource: r.telegram_source || null,
      telegramPrice: r.telegram_price == null ? null : Number(r.telegram_price),
      saleOrderId: r.sale_order_id || null,
      // Only real Agen H2H API invoice (provider_response.data). Older rows
      // never stored `data` — leave blank rather than inventing a ref from
      // trx_refs / telegram order id.
      invoiceNumber: r.invoice_number || null,
      refId: r.ref_id || null,
      serialNumber: r.serial_number && r.serial_number !== "[]" ? r.serial_number : null,
      createdAt: r.created_at,
    };
  });
  cache = { at: now, data };
  return data;
}

export async function listGames() {
  const rows = await getAllRows();
  const byGame = new Map();
  for (const r of rows) {
    const key = gameKey(r.gameName);
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(r);
  }
  return [...byGame.entries()]
    .map(([key, list]) => ({
      gameName: key,
      orderCount: list.length,
      firstOrderAt: list[0]?.createdAt,
      lastOrderAt: list[list.length - 1]?.createdAt,
      deductedIdrTotal: Math.round(list.reduce((s, o) => s + (o.deductedIdr || 0), 0)),
    }))
    .sort((a, b) => new Date(b.lastOrderAt || 0) - new Date(a.lastOrderAt || 0));
}

export async function listOrdersForGames(gameNames) {
  const set = new Set((gameNames || []).map(gameKey).filter(Boolean));
  if (!set.size) return [];
  const rows = await getAllRows();
  return rows.filter((r) => set.has(gameKey(r.gameName)));
}

export async function listGameNames() {
  const rows = await getAllRows();
  return [...new Set(rows.map((r) => r.gameName).filter(Boolean))].sort();
}
