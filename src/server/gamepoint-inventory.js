import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { enrichShellOrders, saleJoin } from "@/server/garena-shell-inventory";
import { allocateShellSale } from "@/lib/garena-shell-inventory";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { GAMEPOINT_METHOD, GAMEPOINT_PAGE_SIZE, GAMEPOINT_REFERENCE, gpFilters, gpOrder, gpObservation, groupGpOrders, gpMatches, gpSummary } from "@/lib/gamepoint-inventory";

const BATCH = 500;
const orderKey = (alias) => `COALESCE(NULLIF(split_part(${alias}.source_order_id::text,':',1),''),${alias}.id::text)`;
const balanceColumns = `c.provider_response#>>'{_worker_meta,balance_before}' AS balance_before,
  c.provider_response#>>'{_worker_meta,submitted_at}' AS submitted_at`;
// No full provider payloads: invoices and metadata can contain credentials.
export const gpColumns = `${balanceColumns},c.quantity,c.provider_response->>'amount' AS provider_amount,
  c.provider_response#>>'{_worker_meta,stored_cost}' AS stored_cost,
  c.provider_response#>>'{_worker_meta,partial_progress,total}' AS plan_total,
  c.provider_response#>'{_worker_meta,trx_refs}' AS plan_refs,
  c.provider_response->>'referenceno' AS provider_ref,
  (SELECT JSONB_AGG(JSONB_BUILD_OBJECT('key',l.key,'ref',l.value->>'trx_ref','status',l.value->>'status','amount',l.value->>'amount'))
    FROM jsonb_each(CASE WHEN jsonb_typeof(c.provider_response#>'{_worker_meta,line_states}')='object'
      THEN c.provider_response#>'{_worker_meta,line_states}' ELSE '{}'::jsonb END) l) AS lines,
  (SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id',x.id,'used',x.amount_used::text,
    'typed',p.payment_method='GamePointClub' AND p.currency='MYR',
    'supported',(p.payment_method='GamePointClub' AND p.currency='MYR') OR (p.payment_method='SYSTEM' AND p.currency='NONE')) ORDER BY x.created_at,x.id)
    FROM inventory_transactions x LEFT JOIN inventory_topups p ON p.id=x.topup_id WHERE x.order_id=c.id) AS ledger_slices`;
export function createGamepointInventory({ select = selectQuery, enrich = enrichShellOrders, prepareSales = prepareCodaSales } = {}) {
  return { async list(actor, query = {}, { exportAll = false } = {}) {
    if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Gamepoint Inventory", 403);
    const filters = gpFilters(query);
    const observed = await select(`SELECT c.id,c.source_order_id,${balanceColumns} FROM codashop_orders c
      WHERE c.payment_method=$1 AND c.status='completed'
      AND c.provider_response#>>'{_worker_meta,balance_before}' ~ '^[0-9]{1,12}(\\.[0-9]{1,20})?$'
      AND c.provider_response#>>'{_worker_meta,submitted_at}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
      ORDER BY c.provider_response#>>'{_worker_meta,submitted_at}' DESC,c.id DESC LIMIT 1`, [GAMEPOINT_METHOD]);
    const rows = []; let cursor = "0";
    for (;;) {
      const batch = await select(`WITH selected_orders AS (
        SELECT DISTINCT ${orderKey("s")} AS order_key,COALESCE(s.source,'') AS source_key
        FROM codashop_orders s WHERE s.payment_method=$1 AND s.status='completed'
          AND s.created_at >= $3::timestamptz AND s.created_at < $4::timestamptz
      ) SELECT c.id,c.source_order_id,c.source,c.created_at AS occurred_at,c.game_name,c.pack_name,
        split_part(c.source_order_id::text,':',1) AS source_base,${gpColumns},
        t.sale_ambiguous,t.order_id AS sale_order_id,t.price::text AS sale_price,t.source AS telegram_source,
        t.method,COALESCE(NULLIF(c.uid,''),t.uid) AS player_id,COALESCE(NULLIF(t.admin,''),NULLIF(t.booked_by,''),'Bot') AS operator
        FROM codashop_orders c ${saleJoin}
        WHERE c.payment_method=$1 AND c.status='completed' AND c.id>$2::bigint
        AND EXISTS (SELECT 1 FROM selected_orders s WHERE s.order_key=${orderKey("c")}
          AND s.source_key=COALESCE(c.source,'')) ORDER BY c.id LIMIT ${BATCH}`,
      [GAMEPOINT_METHOD, cursor, filters.bounds.start, filters.bounds.end]);
      rows.push(...batch);
      if (rows.length > 20000) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
      if (batch.length < BATCH) break;
      cursor = String(batch.at(-1).id);
    }
    if (new Set(rows.map((r) => String(r.id))).size !== rows.length) throw inventoryError("พบคิวซ้ำ ต้องตรวจสอบก่อนรวมยอด", 409);
    const enriched = [];
    for (let i = 0; i < rows.length; i += BATCH) enriched.push(...await enrich(select, rows.slice(i, i + BATCH)));
    const prepared = await prepareSales(enriched.map((row) => ({ sourceId: String(row.id), row, details: row.sheet_fields })), []);
    const all = groupGpOrders(prepared.map(({ row, details }) => gpOrder({ ...row, sheet_fields: allocateShellSale(details) }, filters.rate)));
    const entries = all.filter((e) => gpMatches(e, filters.search)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || Number(b.id) - Number(a.id));
    const offset = (filters.page - 1) * GAMEPOINT_PAGE_SIZE;
    return { dateFrom: filters.dateFrom, dateTo: filters.dateTo, rate: filters.rate, reference: GAMEPOINT_REFERENCE,
      observation: gpObservation(observed[0]), summary: gpSummary(entries), total: entries.length, page: filters.page, pageSize: GAMEPOINT_PAGE_SIZE,
      entries: exportAll ? entries : entries.slice(offset, offset + GAMEPOINT_PAGE_SIZE) };
  } };
}
let repository;
export const gamepointInventory = () => repository ||= createGamepointInventory();
