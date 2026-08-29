// Live, read-only view over DonShop API orders inside codashop_orders
// (payment_method = 'DonShopIDR'). Unlike GoCash/Oxide/WavePay this is not
// a pre-loaded card or wallet pool -- DonShop is an IDR H2H top-up API, so
// phone_number is always null. "Card" in the Profit UI means one game the
// API has topped up (group by game_name), same browsing shape as the other
// live feeds.
//
// Wallet ledger (IDR) comes from provider_response._worker_meta (same shape
// as Game Point Club):
//   balance_before   → ก่อนตัด
//   live_cost_total  → ยอดตัด (qty × unit; falls back to live_cost × qty)
// newBalance = balance_before − deducted when both are present.
// fund_price / pack_price stay available for debugging but are not the
// primary UI columns (fund_price does NOT match sequential wallet drawdown).
import { selectQuery } from "@/lib/profit-remote-db";

function parseIdr(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const CACHE_MS = 5_000;
let cache = { at: 0, data: null };

const PLATFORM_ALIASES = { russia: "russia_reseller" };

function normalizePlatform(raw) {
  if (!raw) return null;
  return PLATFORM_ALIASES[raw] || raw;
}

export function gameKey(gameName) {
  return gameName || "unknown";
}

export async function getAllRows() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;
  const rows = await selectQuery(
    // Same COALESCE chain as WavePay/Oxide: tag from codashop_orders.source,
    // then telegram_orders_dev.source, then letter-prefix of the task id.
    `SELECT c.id, c.pack_name, c.pack_price, c.game_name, c.created_at,
            COALESCE(
              c.source,
              t.source,
              CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END
            ) AS platform,
            t.source AS telegram_source,
            t.price AS telegram_price,
            t.order_id AS sale_order_id,
            c.provider_response->>'fund_price' AS fund_price,
            c.provider_response->>'price' AS api_price,
            c.provider_response->'_worker_meta'->>'balance_before' AS balance_before,
            c.provider_response->'_worker_meta'->>'live_cost_total' AS live_cost_total,
            c.provider_response->'_worker_meta'->>'live_cost' AS live_cost,
            c.provider_response->'_worker_meta'->>'quantity' AS quantity,
            COALESCE(
              c.provider_response->>'main_invoice_number',
              c.provider_response->'invoices'->0->>'invoice_number'
            ) AS invoice_number,
            c.provider_response->>'voucher' AS voucher
     FROM codashop_orders c
     LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
     WHERE c.payment_method = 'DonShopIDR' AND c.status = 'completed'
     ORDER BY c.created_at ASC`
  );
  const data = rows.map((r) => {
    const oldBalanceIdr = parseIdr(r.balance_before);
    const liveTotal = parseIdr(r.live_cost_total);
    const liveCost = parseIdr(r.live_cost);
    const qty = Math.max(1, parseIdr(r.quantity) || 1);
    const fundPriceIdr = parseIdr(r.fund_price);
    // Wallet drawdown: live_cost_total matches sequential balance_before best;
    // fall back to live_cost × qty, then fund_price.
    const deductedIdr = liveTotal ?? (liveCost != null ? liveCost * qty : null) ?? fundPriceIdr;
    const newBalanceIdr =
      oldBalanceIdr != null && deductedIdr != null
        ? Math.round(oldBalanceIdr - deductedIdr)
        : null;
    return {
      id: r.id,
      gameName: r.game_name,
      packName: r.pack_name,
      packPriceIdr: parseIdr(r.pack_price),
      fundPriceIdr,
      apiPriceIdr: parseIdr(r.api_price),
      oldBalanceIdr,
      deductedIdr,
      newBalanceIdr,
      platform: normalizePlatform(r.platform),
      telegramSource: r.telegram_source || null,
      // Telegram queue quote — kept for debugging / platform joins only.
      // NOT used as THB cost: itemku (and similar) store IDR marketplace
      // amounts in t.price, which would inflate baht rollups if trusted.
      telegramPrice: r.telegram_price == null ? null : Number(r.telegram_price),
      saleOrderId: r.sale_order_id || null,
      invoiceNumber: r.invoice_number || null,
      voucher: r.voucher || null,
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
