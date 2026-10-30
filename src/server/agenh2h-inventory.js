import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { enrichShellOrders, saleJoin } from "@/server/garena-shell-inventory";
import { allocateShellSale } from "@/lib/garena-shell-inventory";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { withPageSales } from "@/server/donshop-inventory";
import { platformFromSourceGroup } from "@/server/profit-agenh2h";
import { AGENH2H_METHOD, AGENH2H_PAGE_SIZE, ahFilters, ahOrder, groupAhOrders, ahMatches, ahSummary, ahWallet, ahWalletChecks } from "@/lib/agenh2h-inventory";

const BATCH = 500;
const meta = "c.provider_response->'_worker_meta'";
const balanceOk = `(${meta}->>'balance_before') ~ '^[0-9]{1,12}(\\.[0-9]{1,20})?$'`;
// Bot-run rows only: the worker writes _worker_meta when it takes a queue. Rows a person filled or re-marked without the
// bot (provider_response empty, manual_fulfillment only, staff backlog notes) carry no IDR evidence and are left out.
const botRun = `jsonb_typeof(${meta})='object'`;
// created_at/updated_at are zone-less (stored in the DB's local time). Turn them into instants in SQL, the same way the
// DB reads them for the date filter, so displayed times do not depend on the Node process time zone.
const instant = (column) => `(${column} AT TIME ZONE current_setting('TimeZone'))`;
const chainColumns = `c.id,c.source_order_id,c.status,${instant("c.created_at")} AS occurred_at,${instant("c.updated_at")} AS updated_at,${meta}->>'balance_before' AS balance_before,
  ${meta}->>'live_cost_total' AS live_cost_total,${meta}->>'live_cost' AS live_cost,${meta}->>'quantity' AS quantity,
  c.provider_response->'data'->>'total' AS data_total`;
// Explicit projections only: provider_response also carries buyer/user payloads that must stay in PG.
// AgenH2H often stores source='telegram' (the queue channel, not the sales platform); leave it empty so the sale
// falls back to telegram_orders_dev.source, as /profit/agenh2h-history does. The Agen H2H invoice lives in data.invoice.
const columns = `c.id,c.source_order_id,NULLIF(lower(c.source),'telegram') AS source,c.status,${instant("c.created_at")} AS occurred_at,c.game_name,c.pack_name,
  COALESCE(c.provider_response->'data'->>'invoice',c.provider_response->>'main_invoice_number',c.provider_response->'invoices'->0->>'invoice_number') AS provider_ref,
  ${meta}->>'balance_before' AS balance_before,${meta}->>'live_cost_total' AS live_cost_total,
  ${meta}->>'live_cost' AS live_cost,${meta}->>'quantity' AS quantity,c.provider_response->'data'->>'total' AS data_total`;
// The Telegram chat title of the queue, when every telegram row of the task agrees on it.
const sourceGroup = `(SELECT CASE WHEN COUNT(DISTINCT lower(btrim(g.source_group)))=1 THEN MIN(g.source_group) END
  FROM telegram_orders_dev g WHERE g.task_request_id=c.telegram_task_request_id) AS source_group`;
// A queue whose rows both say only "telegram" (or nothing) takes its platform from the chat title (Russia, Kaleoz, Itemku),
// as /profit/agenh2h-history does; without it a Russia queue's USDT price is never converted and shows no sale.
export function withChatPlatform(row) {
  const named = [row.source, row.telegram_source].some((s) => s && String(s).toLowerCase() !== "telegram");
  const platform = named ? null : platformFromSourceGroup(row.source_group);
  return platform ? { ...row, source: platform } : row;
}
export function createAgenh2hInventory({ select = selectQuery, enrich = enrichShellOrders, prepareSales = prepareCodaSales, pageSales = withPageSales } = {}) {
  return { async list(actor, query = {}, { exportAll = false } = {}) {
    if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู AgenH2H Inventory", 403);
    const filters = ahFilters(query);
    // Latest completed fill is independent of report filters; it reads stored worker evidence, never the provider.
    const walletRows = await select(`SELECT ${columns} FROM codashop_orders c
      WHERE c.payment_method=$1 AND ${botRun} AND c.status='completed' AND ${balanceOk}
      ORDER BY c.created_at DESC,c.id DESC LIMIT 1`, [AGENH2H_METHOD]);
    const wallet = walletRows[0] ? ahWallet(walletRows[0]) : null;
    const rows = []; let cursor = "0";
    for (;;) {
      const batch = await select(`SELECT ${columns},split_part(c.source_order_id::text,':',1) AS source_base,c.telegram_task_request_id AS task_id,
        ${sourceGroup},t.sale_ambiguous,t.order_id AS sale_order_id,t.price::text AS sale_price,t.source AS telegram_source,
        t.method,COALESCE(NULLIF(c.uid,''),t.uid) AS player_id,
        COALESCE(NULLIF(t.admin,''),NULLIF(t.booked_by,''),'Bot') AS operator
        FROM codashop_orders c ${saleJoin}
        WHERE c.payment_method=$1 AND ${botRun} AND c.id>$2::bigint
          AND c.created_at >= $3::timestamptz AND c.created_at < $4::timestamptz
          AND ($5::text IS NULL OR c.status=$5::text)
        ORDER BY c.id LIMIT ${BATCH}`, [AGENH2H_METHOD, cursor, filters.bounds.start, filters.bounds.end, filters.status]);
      rows.push(...batch.map(withChatPlatform));
      if (rows.length > 20000) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
      if (batch.length < BATCH) break;
      cursor = String(batch.at(-1).id);
    }
    if (new Set(rows.map((r) => String(r.id))).size !== rows.length) throw inventoryError("พบคิวซ้ำ ต้องตรวจสอบก่อนรวมยอด", 409);
    const enriched = [];
    for (let i = 0; i < rows.length; i += BATCH) enriched.push(...await pageSales(select, await enrich(select, rows.slice(i, i + BATCH))));
    const prepared = await prepareSales(enriched.map((row) => ({ sourceId: String(row.id), row, details: row.sheet_fields })), []);
    const entries = groupAhOrders(prepared.map(({ row, details }) => ahOrder({ ...row, sheet_fields: allocateShellSale(details) }, filters.rate)), filters.rate)
      .filter((e) => ahMatches(e, filters.search)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || Number(b.id) - Number(a.id));
    // Wallet continuity covers every status in the date range (independent of status/search filters). Fills are chained in
    // the order the bot started them (fill_started_at, which is when balance_before was read), not creation order. A fill
    // starts at most a few hours after creation (max 4h17m seen on Donshop; not measured on AgenH2H), so one day of earlier rows is fetched as context through
    // the created_at index, plus the last completed fill before that as the anchor. The anchor is looked for one more week
    // back only: every row after it is read, so an old anchor (a long run of fills without balance_before) would push the
    // chain past 20,000 rows for any range. Without one the first fill in the range only starts the chain.
    const [anchor] = await select(`SELECT ${chainColumns} FROM codashop_orders c
      WHERE c.payment_method=$1 AND ${botRun} AND c.status='completed' AND c.created_at < ($2::timestamptz - interval '1 day')
        AND c.created_at >= ($2::timestamptz - interval '8 days') AND ${balanceOk}
      ORDER BY c.created_at DESC,c.id DESC LIMIT 1`, [AGENH2H_METHOD, filters.bounds.start]);
    // The DB decides which rows are inside the range, so the cut does not depend on the Node process time zone.
    const chain = await select(`SELECT ${chainColumns},(c.created_at >= $4::timestamptz) AS in_range FROM codashop_orders c
      WHERE c.payment_method=$1 AND ${botRun} AND c.created_at < $3::timestamptz
        AND ${anchor ? "(c.created_at,c.id) > (SELECT a.created_at,a.id FROM codashop_orders a WHERE a.id=$2::bigint)" : "c.created_at >= ($2::timestamptz - interval '1 day')"}
      ORDER BY COALESCE(c.fill_started_at,${instant("c.created_at")}),c.id LIMIT 20001`, [AGENH2H_METHOD, anchor ? String(anchor.id) : filters.bounds.start, filters.bounds.end, filters.bounds.start]);
    if (chain.length > 20000) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
    const inRange = new Set(chain.filter((r) => r.in_range).map((r) => String(r.id)));
    const alerts = ahWalletChecks(chain, anchor).filter((a) => inRange.has(a.order.id));
    const offset = (filters.page - 1) * AGENH2H_PAGE_SIZE;
    return { dateFrom: filters.dateFrom, dateTo: filters.dateTo, rate: filters.rate, status: filters.status, alerts,
      balance: wallet?.amount ?? null, balanceAt: wallet?.checkedAt ?? null, balanceOrderId: wallet?.orderId || null,
      summary: ahSummary(entries), total: entries.length, page: filters.page, pageSize: AGENH2H_PAGE_SIZE,
      entries: exportAll ? entries : entries.slice(offset, offset + AGENH2H_PAGE_SIZE) };
  } };
}
let repository;
export const agenh2hInventory = () => repository ||= createAgenh2hInventory();
