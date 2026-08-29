// Live, read-only view over Codashop Reseller (USD) API orders inside
// codashop_orders (payment_method = 'CodashopUSD').
//
// This is NOT the Sky bot feed (payment_method = 'Codashop' — that lives in
// the separate codashop_auto_api project). Codareseller is the multi-game
// reseller API: phone_number is always null, "card" = one game (group by
// game_name).
//
// Wallet ledger (USD) is NOT in provider_response — CodaTopupWorker only
// puts Old/New Balance in the Telegram notify. The same numbers are pushed
// to inventory_transactions (amount_used / balance_after). Reconstruct:
//   ก่อนตัด  = balance_after + amount_used   (= Telegram "Old Balance")
//   ยอดตัด   = amount_used (fallback pack_price)
//   คงเหลือ  = balance_after                (= Telegram "New Balance")
// Invoice = Codashop orderId(s) from the provider_response array.
import { selectQuery } from "@/lib/profit-remote-db";

function parseUsd(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function roundUsd(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

const CACHE_MS = 5_000;
let cache = { at: 0, data: null };

const PLATFORM_ALIASES = { russia: "russia_reseller" };

// Case / typo aliases → one canonical card name. Sheet lists "ZEPETO"; DB
// almost always writes "Zepeto", with 2 playerok rows as "ZEPETO".
const GAME_ALIASES = {
  zepeto: "Zepeto",
};

// telegram_orders_dev.source_group is the Telegram chat title. Codareseller
// often stores source = 'telegram' (queue channel) for Russia-queue rows in
// "UID RUSSIAN ORDER" — those must land on russia_reseller (USDT Russia).
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

function resolvePlatform(raw, sourceGroup, inOrderRussia) {
  const fromGroup = platformFromSourceGroup(sourceGroup);
  const normalized = normalizePlatform(raw);
  // "telegram" is the fulfillment channel, not Kaleoz/PAGE/Russia — prefer
  // the chat-title map; then order_russia membership (Russia USDT sheet).
  if (!normalized || normalized === "telegram") {
    if (fromGroup) return fromGroup;
    if (inOrderRussia) return "russia_reseller";
    return null;
  }
  return normalized;
}

export function gameKey(gameName) {
  if (!gameName) return "unknown";
  const trimmed = String(gameName).trim();
  const alias = GAME_ALIASES[trimmed.toLowerCase()];
  return alias || trimmed;
}

/** Inventory sometimes stored balance_after=0 before the ledger was real — treat as missing. */
function inventoryBalanceUsd(raw) {
  const n = parseUsd(raw);
  if (n == null || n <= 0) return null;
  return n;
}

export async function getAllRows() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;
  const [rows, russiaRows] = await Promise.all([
    selectQuery(
      `SELECT c.id, c.pack_name, c.pack_price, c.game_name, c.created_at, c.source_order_id,
              c.telegram_task_request_id,
              COALESCE(
                c.source,
                t.source,
                CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END
              ) AS platform,
              t.source_group AS telegram_source_group,
              t.source AS telegram_source,
              t.price AS telegram_price,
              t.order_id AS sale_order_id,
              (
                SELECT string_agg(elem->>'orderId', ', ')
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(c.provider_response) = 'array'
                    THEN c.provider_response ELSE '[]'::jsonb END
                ) elem
                WHERE elem->>'orderId' IS NOT NULL AND elem->>'orderId' <> ''
              ) AS invoice_number,
              (
                SELECT string_agg(elem->>'skuId', ', ')
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(c.provider_response) = 'array'
                    THEN c.provider_response ELSE '[]'::jsonb END
                ) elem
                WHERE elem->>'skuId' IS NOT NULL AND elem->>'skuId' <> ''
              ) AS sku_ids,
              inv.amount_used AS inv_amount_used,
              inv.balance_after AS inv_balance_after
       FROM codashop_orders c
       LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
       LEFT JOIN LATERAL (
         SELECT amount_used, balance_after
         FROM inventory_transactions
         WHERE order_id = c.id
         ORDER BY created_at DESC
         LIMIT 1
       ) inv ON TRUE
       WHERE c.payment_method = 'CodashopUSD' AND c.status = 'completed'
       ORDER BY c.created_at ASC`
    ),
    // Russia sheet ids — used to recover platform when source is only "telegram"
    // (ops chat) but the sale lives in order_russia.
    selectQuery(`SELECT order_id::text AS order_id, task_id::text AS task_id FROM order_russia`),
  ]);

  const russiaOrderIds = new Set();
  const russiaTaskIds = new Set();
  for (const r of russiaRows) {
    if (r.order_id) russiaOrderIds.add(String(r.order_id));
    if (r.task_id) russiaTaskIds.add(String(r.task_id));
  }

  const data = rows.map((r) => {
    const packPriceUsd = parseUsd(r.pack_price);
    const amountUsed = parseUsd(r.inv_amount_used);
    // Real wallet remaining only — ignore sentinel 0 from early inventory sync.
    const newBalanceUsd = inventoryBalanceUsd(r.inv_balance_after);
    const deductedUsd = amountUsed ?? packPriceUsd;
    const oldBalanceUsd =
      newBalanceUsd != null && deductedUsd != null
        ? roundUsd(newBalanceUsd + deductedUsd)
        : null;
    const inOrderRussia =
      (r.source_order_id && russiaOrderIds.has(String(r.source_order_id))) ||
      (r.telegram_task_request_id && russiaTaskIds.has(String(r.telegram_task_request_id)));
    return {
      id: r.id,
      // Canonical name so ZEPETO / Zepeto share one card.
      gameName: gameKey(r.game_name),
      gameNameRaw: r.game_name,
      packName: r.pack_name,
      packPriceRaw: r.pack_price || null,
      // Same figures Telegram "CodaResell Job Update" shows as Old/New Balance
      // when inventory has a real balance_after (> 0).
      oldBalanceUsd,
      deductedUsd,
      newBalanceUsd,
      platform: resolvePlatform(r.platform, r.telegram_source_group, inOrderRussia),
      telegramSource: r.telegram_source || null,
      telegramPrice: r.telegram_price == null ? null : Number(r.telegram_price),
      saleOrderId: r.sale_order_id || null,
      invoiceNumber: r.invoice_number || null,
      skuIds: r.sku_ids || null,
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
  return [...new Set(rows.map((r) => gameKey(r.gameName)).filter(Boolean))].sort();
}
