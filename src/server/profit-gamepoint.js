// Live, read-only view over Game Point Club API orders inside codashop_orders
// (payment_method = 'GamePointClub'). Like DonShop this is an H2H top-up API
// (MYR wallet), not a pre-loaded card — phone_number is always null. "Card"
// in the Profit UI means one game the API has topped up (group by game_name).
//
// Wallet ledger (MYR) comes from provider_response:
//   balance_before  → ก่อนตัด
//   amount          → ยอดตัด (actual wallet drawdown; matches sequential
//                     balance continuity better than stored_cost)
//   stored_cost     → ต้นทุนในบัญชี GP ของเรา (อาจต่างจาก amount)
// newBalance = balance_before − amount when both are present.
import { selectQuery } from "@/lib/profit-remote-db";

function parseMyr(v) {
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
    `SELECT c.id, c.pack_name, c.game_name, c.created_at,
            COALESCE(
              c.source,
              t.source,
              CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END
            ) AS platform,
            t.source AS telegram_source,
            t.price AS telegram_price,
            t.order_id AS sale_order_id,
            c.provider_response->>'amount' AS amount_myr,
            c.provider_response->'_worker_meta'->>'stored_cost' AS stored_cost_myr,
            c.provider_response->'_worker_meta'->>'balance_before' AS balance_before_myr,
            c.provider_response->>'referenceno' AS reference_no,
            c.provider_response->>'item' AS item_label
     FROM codashop_orders c
     LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
     WHERE c.payment_method = 'GamePointClub' AND c.status = 'completed'
     ORDER BY c.created_at ASC`
  );
  const data = rows.map((r) => {
    const oldBalanceMyr = parseMyr(r.balance_before_myr);
    const amountMyr = parseMyr(r.amount_myr);
    const storedCostMyr = parseMyr(r.stored_cost_myr);
    // Wallet drawdown prefers `amount` (matches next order's balance_before);
    // fall back to stored_cost when amount is missing (~9% of rows).
    const deductedMyr = amountMyr ?? storedCostMyr;
    const newBalanceMyr =
      oldBalanceMyr != null && deductedMyr != null
        ? Math.round((oldBalanceMyr - deductedMyr) * 100) / 100
        : null;
    return {
      id: r.id,
      gameName: r.game_name,
      packName: r.pack_name,
      platform: normalizePlatform(r.platform),
      telegramSource: r.telegram_source || null,
      // Telegram queue quote — kept for debugging only. NOT used as THB cost
      // (same rule as Donshop: marketplace/API currency must not inflate baht).
      telegramPrice: r.telegram_price == null ? null : Number(r.telegram_price),
      saleOrderId: r.sale_order_id || null,
      referenceNo: r.reference_no || null,
      itemLabel: r.item_label || null,
      oldBalanceMyr,
      deductedMyr,
      newBalanceMyr,
      storedCostMyr,
      amountMyr,
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
      deductedMyrTotal: list.reduce((s, o) => s + (o.deductedMyr || 0), 0),
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
