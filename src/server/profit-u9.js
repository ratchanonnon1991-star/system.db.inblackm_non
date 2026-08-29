// Live, read-only view over U9 (Ooredoo / ATOM telco airtime) orders inside
// codashop_orders (payment_method = 'U9'). The product sheet labels the
// channel "Ooredoo"; the bot writes payment_method "U9" (legacy "Ooredoo"
// rows exist but none completed). Same shape as WavePay: phone_number is
// the telco MSISDN the bot charges, pack_price is MMK ("Ks10,500"), and
// several games can share one number -- so "card" below means one phone
// account. Unlike WavePay, provider_response.balances is always "N/A" on
// live U9 rows (confirmed), so the Kyat "ยอดตัด" falls back to pack_price.
import { selectQuery } from "@/lib/profit-remote-db";

function parseKyat(v) {
  if (v == null) return null;
  const s = String(v).trim();
  // U9 provider_response.balances is literally "N/A" on every live row --
  // Number("N/A".replace(...)) would become 0 and shadow pack_price.
  if (!s || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
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

export async function getAllRows() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;
  const rows = await selectQuery(
    `SELECT c.id, c.phone_number AS account, c.pack_name, c.pack_price, c.game_name,
            c.invoice_txn_id, c.created_at,
            COALESCE(
              c.source,
              t.source,
              CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id, '-', 1) END
            ) AS platform,
            t.source_group AS telegram_source_group,
            t.order_id AS sale_order_id,
            c.provider_response->'confirm'->>'orderId' AS confirm_order_id,
            c.provider_response->'start'->>'orderId' AS start_order_id,
            c.provider_response->'balances'->>'oldBalance' AS old_balance,
            c.provider_response->'balances'->>'newBalance' AS new_balance
     FROM codashop_orders c
     LEFT JOIN telegram_orders_dev t ON t.task_request_id = c.telegram_task_request_id
     WHERE c.payment_method IN ('U9', 'Ooredoo')
       AND c.status = 'completed'
       AND c.phone_number IS NOT NULL
     ORDER BY c.created_at ASC`
  );
  const data = rows.map((r) => {
    const packPriceKs = parseKyat(r.pack_price);
    const oldBalance = parseKyat(r.old_balance);
    const newBalance = parseKyat(r.new_balance);
    const deductedFromBal =
      oldBalance != null && newBalance != null
        ? Math.round((oldBalance - newBalance) * 100) / 100
        : null;
    return {
      id: r.id,
      account: r.account,
      packName: r.pack_name,
      packPriceKs,
      gameName: r.game_name,
      invoiceTxnId: r.invoice_txn_id,
      createdAt: r.created_at,
      platform: normalizePlatform(r.platform) || platformFromSourceGroup(r.telegram_source_group),
      // Prefer Telegram customer ORDER ID; fall back to Codashop confirm /
      // start orderId, then invoice_txn_id (test/orphan rows often lack
      // a telegram join — e.g. task id "TTTTaa123").
      saleOrderId:
        r.sale_order_id
        || r.confirm_order_id
        || r.start_order_id
        || r.invoice_txn_id
        || null,
      oldBalance,
      newBalance,
      // Balances are N/A on every live U9 row today -- pack_price (Ks…) is
      // the real MMK charge from the telco / product sheet "MMK ที่ตัด".
      deducted: deductedFromBal ?? packPriceKs,
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

export async function listGameNames() {
  const rows = await getAllRows();
  return [...new Set(rows.map((r) => r.gameName).filter(Boolean))].sort();
}
