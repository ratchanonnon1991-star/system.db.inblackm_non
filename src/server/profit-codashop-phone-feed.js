// Shared live feed for Codashop airtime / wallet-phone channels that land
// in codashop_orders (TrueMoney, ATOM, Smart/Sun — see codashop_auto_api).
// Same card model as U9/Wavepay: "card" = one phone_number. Balances in
// provider_response are always N/A for these channels; ยอดตัด = pack_price.
import { selectQuery } from "@/lib/profit-remote-db";

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

function defaultParseAmount(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{
 *   paymentMethods: string[],
 *   parseAmount?: (v: unknown) => number | null,
 * }} opts
 */
export function createCodashopPhoneFeed({ paymentMethods, parseAmount = defaultParseAmount }) {
  const CACHE_MS = 5_000;
  let cache = { at: 0, data: null };
  const methodsSql = paymentMethods.map((_, i) => `$${i + 1}`).join(", ");

  async function getAllRows() {
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
       WHERE c.payment_method IN (${methodsSql})
         AND c.status = 'completed'
         AND c.phone_number IS NOT NULL
         AND c.phone_number <> ''
       ORDER BY c.created_at ASC`,
      paymentMethods
    );
    const data = rows.map((r) => {
      const packPrice = parseAmount(r.pack_price);
      const oldBalance = parseAmount(r.old_balance);
      const newBalance = parseAmount(r.new_balance);
      const deductedFromBal =
        oldBalance != null && newBalance != null
          ? Math.round((oldBalance - newBalance) * 100) / 100
          : null;
      return {
        id: r.id,
        account: r.account,
        packName: r.pack_name,
        packPrice,
        gameName: r.game_name,
        invoiceTxnId: r.invoice_txn_id,
        createdAt: r.created_at,
        platform: normalizePlatform(r.platform) || platformFromSourceGroup(r.telegram_source_group),
        saleOrderId:
          r.sale_order_id
          || r.confirm_order_id
          || r.start_order_id
          || r.invoice_txn_id
          || null,
        oldBalance,
        newBalance,
        deducted: deductedFromBal ?? packPrice,
      };
    });
    cache = { at: now, data };
    return data;
  }

  function accountKey(account) {
    return account || "unknown";
  }

  async function listAccounts() {
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
        lastBalance: list[list.length - 1]?.newBalance ?? null,
        firstOrderAt: list[0]?.createdAt,
        lastOrderAt: list[list.length - 1]?.createdAt,
      }))
      .sort((a, b) => new Date(b.lastOrderAt || 0) - new Date(a.lastOrderAt || 0));
  }

  async function listOrdersForAccounts(accounts) {
    const set = new Set((accounts || []).filter(Boolean));
    if (!set.size) return [];
    const rows = await getAllRows();
    return rows.filter((r) => set.has(r.account));
  }

  async function listGameNames() {
    const rows = await getAllRows();
    return [...new Set(rows.map((r) => r.gameName).filter(Boolean))].sort();
  }

  return {
    getAllRows,
    accountKey,
    listAccounts,
    listOrdersForAccounts,
    listGameNames,
  };
}
