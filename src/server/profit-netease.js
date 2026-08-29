// Live, read-only view over Netease bot purchases in netease_purchase_history.
// "Card" = one game (group by game_name). Shared purchase email tops up
// several games — do not group by email.
//
// Wallet ledger (USD) is native on the history table:
//   old_balance → ก่อนตัด
//   deducted    → ยอดตัด
//   new_balance → คงเหลือ
// Platform / sale order come from the linked codashop_orders row (order_id).
import { selectQuery } from "@/lib/profit-remote-db";

function parseUsd(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const CACHE_MS = 5_000;
let cache = { at: 0, data: null };

const PLATFORM_ALIASES = { russia: "russia_reseller" };

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
    `SELECT n.id, n.pack_name, n.game_name, n.created_at,
            n.old_balance, n.deducted, n.new_balance,
            n.order_id AS coda_order_id,
            n.netease_order_no, n.purchase_email, n.receipt_url,
            COALESCE(
              c.source,
              t.source,
              CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END
            ) AS platform,
            t.source_group AS telegram_source_group,
            t.source AS telegram_source,
            t.price AS telegram_price,
            t.order_id AS sale_order_id
     FROM netease_purchase_history n
     LEFT JOIN codashop_orders c ON c.id = n.order_id
     LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
     ORDER BY n.created_at ASC, n.id ASC`
  );
  const data = rows.map((r) => {
    const oldBalanceUsd = parseUsd(r.old_balance);
    const deductedUsd = parseUsd(r.deducted);
    const newBalanceUsd = parseUsd(r.new_balance);
    return {
      id: r.id,
      codaOrderId: r.coda_order_id,
      gameName: r.game_name,
      packName: r.pack_name,
      oldBalanceUsd,
      deductedUsd,
      newBalanceUsd,
      neteaseOrderNo: r.netease_order_no || null,
      purchaseEmail: r.purchase_email || null,
      receiptUrl: r.receipt_url || null,
      platform: resolvePlatform(r.platform, r.telegram_source_group),
      telegramSource: r.telegram_source || null,
      telegramPrice: r.telegram_price == null ? null : Number(r.telegram_price),
      saleOrderId: r.sale_order_id || null,
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
      deductedUsdTotal: Math.round(list.reduce((s, o) => s + (o.deductedUsd || 0), 0) * 100) / 100,
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
