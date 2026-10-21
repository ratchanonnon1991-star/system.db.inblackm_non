import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { enrichShellOrders, saleJoin } from "@/server/garena-shell-inventory";
import { allocateShellSale } from "@/lib/garena-shell-inventory";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { PLSBUY_METHOD, PLSBUY_PAGE_SIZE, PLSBUY_SHEET_REFERENCE, plsFilters, plsOrder, groupPlsOrders, plsMatches, plsSummary, plsAmount, plsWallet } from "@/lib/plsbuy-inventory";

const BATCH = 500;
const walletPath = "c.provider_response#>'{_worker_meta,wallet_balance}'";
const walletColumns = `${walletPath}->>'after' AS wallet_after,${walletPath}->>'before' AS wallet_before,
  ${walletPath}->>'checked_at' AS wallet_checked_at,${walletPath}->>'currency' AS wallet_currency,${walletPath}->>'source' AS wallet_source`;
// SYSTEM/NONE is a placeholder cost lot. Its amount_used is recorded by the
// Plsbuy queue, but its zero cost and shared balance are not a real MYR wallet.
const typed = `p.payment_method='PlsbuyMYR' AND p.currency='MYR'`;
const supported = `((${typed}) OR (p.payment_method='SYSTEM' AND p.currency='NONE'))`;
export const plsLedgerJoin = `LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS ledger_count,
    CASE WHEN COUNT(*)>0 AND BOOL_AND(COALESCE(${supported} AND x.amount_used IS NOT NULL AND x.amount_used>=0,FALSE))
      THEN SUM(x.amount_used) END AS myr_used,
    CASE WHEN COUNT(*)>0 AND BOOL_AND(COALESCE(${typed} AND x.cost_thb IS NOT NULL AND x.cost_thb>=0,FALSE))
      THEN SUM(x.cost_thb) END AS recorded_cost,
    JSONB_AGG(JSONB_BUILD_OBJECT('id',x.id,'used',x.amount_used::text,'cost',x.cost_thb::text,
      'balance',x.balance_after::text,'typed',(${typed})) ORDER BY x.created_at,x.id) AS ledger_slices
  FROM inventory_transactions x LEFT JOIN inventory_topups p ON p.id=x.topup_id WHERE x.order_id=c.id
) ledger ON TRUE`;
export function createPlsbuyInventory({ select = selectQuery, enrich = enrichShellOrders, prepareSales = prepareCodaSales } = {}) {
  return { async list(actor, query = {}, { exportAll = false } = {}) {
    if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Plsbuy Inventory", 403);
    const filters = plsFilters(query);
    // Latest successful API observation is independent of report date/search filters.
    // This reads stored evidence only; never calls a provider or replays /consume.
    const walletRows = await select(`SELECT c.id,c.source_order_id,${walletColumns}
      FROM codashop_orders c WHERE c.payment_method=$1 AND c.status='completed'
        AND ${walletPath}->>'currency'='MYR' AND ${walletPath}->>'source'='plsbuy_api'
        AND (${walletPath}->>'after') ~ '^[0-9]{1,12}(\\.[0-9]{1,20})?$'
        AND (${walletPath}->>'checked_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
      ORDER BY ${walletPath}->>'checked_at' DESC,c.id DESC LIMIT 1`, [PLSBUY_METHOD]);
    const wallet = plsWallet(walletRows[0]);
    const lots = await select(`SELECT COUNT(*)::int AS lot_count,
      CASE WHEN COUNT(*)>0 AND COUNT(remaining_balance)=COUNT(*) AND MIN(remaining_balance)>=0 THEN SUM(remaining_balance) END AS remaining,
      MAX(updated_at) AS observed_at FROM inventory_topups
      WHERE payment_method=$1 AND currency='MYR' AND status IN ('active','exhausted')`, [PLSBUY_METHOD]);
    const rows = []; let cursor = "0";
    for (;;) {
      const batch = await select(`SELECT c.id,c.source_order_id,c.source,c.created_at AS occurred_at,c.game_name,c.pack_name,
        c.provider_response->>'reference' AS provider_ref,split_part(c.source_order_id::text,':',1) AS source_base,${walletColumns},
        ledger.myr_used::text,ledger.recorded_cost::text,ledger.ledger_slices,
        t.sale_ambiguous,t.order_id AS sale_order_id,t.price::text AS sale_price,t.source AS telegram_source,
        t.method,COALESCE(NULLIF(c.uid,''),t.uid) AS player_id,
        COALESCE(NULLIF(t.admin,''),NULLIF(t.booked_by,''),'Bot') AS operator
        FROM codashop_orders c ${saleJoin} ${plsLedgerJoin}
        WHERE c.payment_method=$1 AND c.status='completed' AND c.id>$2::bigint
          AND c.created_at >= $3::timestamptz AND c.created_at < $4::timestamptz
        ORDER BY c.id LIMIT ${BATCH}`, [PLSBUY_METHOD, cursor, filters.bounds.start, filters.bounds.end]);
      rows.push(...batch);
      if (rows.length > 20000) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
      if (batch.length < BATCH) break;
      cursor = String(batch.at(-1).id);
    }
    if (new Set(rows.map((r) => String(r.id))).size !== rows.length) throw inventoryError("พบคิวซ้ำ ต้องตรวจสอบก่อนรวมยอด", 409);
    const enriched = [];
    for (let i = 0; i < rows.length; i += BATCH) enriched.push(...await enrich(select, rows.slice(i, i + BATCH)));
    const prepared = await prepareSales(enriched.map((row) => ({ sourceId: String(row.id), row, details: row.sheet_fields })), []);
    const entries = groupPlsOrders(prepared.map(({ row, details }) => plsOrder({ ...row, sheet_fields: allocateShellSale(details) }, filters.rate)))
      .filter((e) => plsMatches(e, filters.search)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || Number(b.id) - Number(a.id));
    const offset = (filters.page - 1) * PLSBUY_PAGE_SIZE;
    return { dateFrom: filters.dateFrom, dateTo: filters.dateTo, rate: filters.rate, reference: PLSBUY_SHEET_REFERENCE,
      balance: wallet?.amount ?? plsAmount(lots[0]?.remaining), balanceAt: wallet?.checkedAt ?? lots[0]?.observed_at ?? null,
      balanceSource: wallet ? "plsbuy_api" : plsAmount(lots[0]?.remaining) !== null ? "inventory_lots" : null,
      balanceOrderId: wallet?.orderId || null, lotBalance: plsAmount(lots[0]?.remaining), lotCount: Number(lots[0]?.lot_count || 0),
      summary: plsSummary(entries), total: entries.length, page: filters.page, pageSize: PLSBUY_PAGE_SIZE,
      entries: exportAll ? entries : entries.slice(offset, offset + PLSBUY_PAGE_SIZE) };
  } };
}
let repository;
export const plsbuyInventory = () => repository ||= createPlsbuyInventory();
