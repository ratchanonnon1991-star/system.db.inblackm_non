import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { listingFields } from "@/lib/usdcodashop-sheet";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { SHELL_ACCOUNTS, SHELL_METHOD, SHELL_MAX_ORDERS, SHELL_PAGE_SIZE,
  shellFilters, shellAmount, shellOrder, shellSummary, shellMatches, allocateShellSale, groupShellOrders } from "@/lib/garena-shell-inventory";

const BATCH = 500;
const accountSql = `lower(btrim(c.provider_response->>'garena_username'))`;
// Explicit projections only: provider_response also contains session/cookie data and must never leave PG.
const columns = `c.id,c.source_order_id,c.game_name,c.pack_name,c.source,c.created_at AS occurred_at,c.updated_at AS observed_at,
  c.provider_response->>'garena_username' AS garena_username,
  c.provider_response->>'shell_used' AS shell_used,
  c.provider_response->>'shell_balance_before' AS shell_before,
  c.provider_response->>'shell_balance_after' AS shell_after,
  c.provider_response->>'shell_balance' AS shell_balance,
  c.invoice_txn_id AS invoice_number`;
const usernames = SHELL_ACCOUNTS.map((account) => account.id);
// Strip only the provider dispatch suffix. /1 and /2 identify different purchased
// units and must survive both the sale lookup and the pack-count grouping.
const sourceKey = (alias) => `split_part(${alias}.source_order_id::text,':',1)`;
const consistentSale = `COUNT(DISTINCT ROW(t.order_id,t.price,t.source))=1`;
export const saleJoin = `LEFT JOIN LATERAL (
  SELECT CASE WHEN ${consistentSale} THEN MIN(t.order_id::text) END AS order_id,
    CASE WHEN ${consistentSale} THEN MIN(t.price) END AS price,
    CASE WHEN ${consistentSale} THEN MIN(t.source) END AS source,
    CASE WHEN COUNT(DISTINCT t.method)=1 THEN MIN(t.method) END AS method,
    CASE WHEN COUNT(DISTINCT t.uid)=1 THEN MIN(t.uid) END AS uid,
    CASE WHEN COUNT(DISTINCT t.admin)=1 THEN MIN(t.admin) END AS admin,
    CASE WHEN COUNT(DISTINCT t.booked_by)=1 THEN MIN(t.booked_by) END AS booked_by,
    COUNT(DISTINCT ROW(t.order_id,t.price,t.source))>1 AS sale_ambiguous
  FROM telegram_orders_dev t WHERE t.task_request_id=c.telegram_task_request_id
    AND (t.order_id::text=${sourceKey("c")} OR NOT EXISTS (
      SELECT 1 FROM telegram_orders_dev exact WHERE exact.task_request_id=c.telegram_task_request_id
        AND exact.order_id::text=${sourceKey("c")}
    ))
) t ON TRUE`;

// A reused transport task must not inflate pack counts or bind another order's price.
export async function enrichShellOrders(select, rows) {
  if (!rows.length) return [];
  const keys = [...new Set(rows.map((row) => String(row.sale_order_id || row.source_base || row.id)))];
  const counts = await select(`SELECT ${sourceKey("c")} AS sale_key,COUNT(DISTINCT c.id)::int AS pack_count,
    ARRAY_AGG(DISTINCT c.id ORDER BY c.id) AS pack_ids
    FROM codashop_orders c WHERE c.status='completed' AND ${sourceKey("c")}=ANY($1::text[]) GROUP BY 1`, [keys]);
  const listings = await select(`SELECT DISTINCT ON (order_id,source) order_id,source AS listing_source,
    payload->>'amount' AS sale_amount,payload->>'buyer' AS buyer,payload->>'link' AS link,
    payload->>'uid' AS player_id,payload->>'filler' AS filler
    FROM sheet_jobs WHERE order_id=ANY($1::text[]) AND target='marketplace'
      AND source IN ('kaleoz','itemku','playerok','playerok-topupman','g2g','coda-worker')
    ORDER BY order_id,source,created_at DESC,id DESC`, [keys]);
  const packGroups = new Map(counts.map((item) => [String(item.sale_key), {
    count: Number(item.pack_count), positions: new Map((item.pack_ids || []).map((id, index) => [String(id), index])),
  }]));
  return rows.map((row) => {
    const key = String(row.sale_order_id || row.source_base || row.id);
    const group = packGroups.get(key), position = group?.positions.get(String(row.id));
    const matches = listings.filter((item) => String(item.order_id) === key);
    const listing = matches.find((item) => item.listing_source === String(row.source || row.telegram_source || "").toLowerCase()) || {};
    const filler = matches.find((item) => item.listing_source === "coda-worker")?.filler;
    // Convert the complete payment first; allocate exact satang only after FX preparation.
    const fields = listingFields({ ...row, pack_count: 1 }, { ...listing, filler });
    fields.saleAllocation = { count: group?.count || 0, position: position ?? -1 };
    if (row.sale_ambiguous || position == null || !group || group.positions.size !== group.count) {
      fields.saleThb = null; fields.saleNative = null; fields.saleCurrency = null; fields.saleAmbiguous = true;
    }
    return { ...row, sheet_fields: fields };
  });
}

export function createGarenaShellInventory({ select = selectQuery, enrich = enrichShellOrders, prepareSales = prepareCodaSales } = {}) {
  return {
    async list(actor, query = {}, { exportAll = false } = {}) {
      if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Garena Shell Inventory", 403);
      const filters = shellFilters(query);
      const latest = await select(`SELECT DISTINCT ON (${accountSql}) ${columns}
        FROM codashop_orders c WHERE c.payment_method=$1 AND c.status='completed' AND ${accountSql}=ANY($2::text[])
        ORDER BY ${accountSql},c.updated_at DESC,c.id DESC`, [SHELL_METHOD, usernames]);
      const rows = []; let cursor = "0";
      for (;;) {
        const batch = await select(`SELECT ${columns},${sourceKey("c")} AS source_base,t.sale_ambiguous,t.order_id AS sale_order_id,t.price::text AS sale_price,
          t.source AS telegram_source,t.method,COALESCE(NULLIF(c.uid,''),t.uid) AS player_id,
          COALESCE(NULLIF(t.admin,''),NULLIF(t.booked_by,''),'Bot') AS operator
          FROM codashop_orders c ${saleJoin}
          WHERE c.payment_method=$1 AND c.status='completed' AND ${accountSql}=ANY($2::text[]) AND c.id>$3::bigint
            AND c.created_at >= $4::timestamptz AND c.created_at < $5::timestamptz
          ORDER BY c.id LIMIT ${BATCH}`, [SHELL_METHOD, usernames, cursor, filters.bounds.start, filters.bounds.end]);
        rows.push(...batch);
        if (rows.length > SHELL_MAX_ORDERS) throw inventoryError("มีเกิน 20,000 ออเดอร์ กรุณาลดช่วงวันที่", 413);
        if (batch.length < BATCH) break;
        cursor = String(batch.at(-1).id);
      }
      if (new Set(rows.map((row) => String(row.id))).size !== rows.length) throw inventoryError("พบคิวซ้ำจากต้นทาง ต้องตรวจสอบก่อนรวมยอด", 409);
      const enriched = [];
      for (let i = 0; i < rows.length; i += BATCH) enriched.push(...await enrich(select, rows.slice(i, i + BATCH)));
      const prepared = await prepareSales(enriched.map((row) => ({ sourceId: String(row.id), row, details: row.sheet_fields })), []);
      const entries = groupShellOrders(prepared.map((p) => shellOrder({ ...p.row, sheet_fields: allocateShellSale(p.details) })).filter(Boolean));
      const cards = SHELL_ACCOUNTS.map((account) => {
        const row = latest.find((r) => String(r.garena_username || "").trim().toLowerCase() === account.id);
        return { ...account, ...shellSummary(entries.filter((e) => e.account === account.id)),
          balance: row ? shellAmount(row.shell_after ?? row.shell_balance) : null,
          balanceAt: row?.observed_at ? new Date(row.observed_at).toISOString() : null,
          balanceOrderId: row ? String(row.source_order_id || row.id) : null };
      });
      const matched = entries.filter((e) => (!filters.account || e.account === filters.account) && shellMatches(e, filters.search))
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || Number(b.id) - Number(a.id));
      const offset = (filters.page - 1) * SHELL_PAGE_SIZE;
      return { dateFrom: filters.dateFrom, dateTo: filters.dateTo, cards, summary: shellSummary(matched),
        total: matched.length, page: filters.page, pageSize: SHELL_PAGE_SIZE,
        entries: exportAll ? matched : matched.slice(offset, offset + SHELL_PAGE_SIZE), observedAt: new Date().toISOString() };
    },
  };
}
let repository;
export const garenaShellInventory = () => repository ||= createGarenaShellInventory();
