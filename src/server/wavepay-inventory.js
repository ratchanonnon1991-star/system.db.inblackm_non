import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { attachSheetFields } from "@/server/usdcodashop-source";
import {
  WAVEPAY_MAX_ORDERS, WAVEPAY_METHOD, WAVEPAY_PAGE_SIZE, WAVE_PHONE_SQL,
  normalizeWaveOrder, summarizeWaveLines, waveFilters, waveMatches,
} from "@/lib/wavepay-inventory";

const BATCH = 500;
// The wallet's own before/after read (provider_response.balances) is the per-order MMK ledger;
// inventory_transactions is not used for WavePay (same source as profit-wavepay.js).
const orderColumns = `c.id,c.source_order_id,c.game_name,c.pack_name,c.pack_price,c.source,${WAVE_PHONE_SQL} AS phone_key,
  t.order_id AS sale_order_id,t.price::text AS sale_price,COALESCE(t.source,
    CASE WHEN c.telegram_task_request_id ~ '^[a-zA-Z]+-' THEN split_part(c.telegram_task_request_id,'-',1) END) AS telegram_source,
  t.method,COALESCE(NULLIF(c.uid,''),t.uid) AS player_id,
  COALESCE(NULLIF(t.admin,''),NULLIF(t.booked_by,''),'Bot') AS operator,
  CASE WHEN jsonb_typeof(c.provider_response)='object' THEN c.provider_response->'balances'->>'oldBalance' END AS old_balance,
  CASE WHEN jsonb_typeof(c.provider_response)='object' THEN c.provider_response->'balances'->>'newBalance' END AS new_balance,
  c.created_at AS occurred_at,c.invoice_txn_id AS invoice_number`;
const orderJoins = `LEFT JOIN telegram_orders_dev t ON t.task_request_id=c.telegram_task_request_id`;

// Read-only and live: WavePay keeps no local ledger. Each order already names the SIM that paid
// (codashop_orders.phone_number).
export function createWavePayInventory(select = selectQuery, { prepareSales = prepareCodaSales } = {}) {
  async function rangeOrders(bounds) {
    const all = []; let cursor = "0";
    for (;;) {
      const rows = await select(`SELECT ${orderColumns}
        FROM codashop_orders c ${orderJoins}
        WHERE c.payment_method=$1 AND c.status='completed' AND c.id>$2::bigint
          AND c.created_at >= $3::timestamptz AND c.created_at < $4::timestamptz
        ORDER BY c.id LIMIT ${BATCH}`, [WAVEPAY_METHOD, cursor, bounds.start, bounds.end]);
      all.push(...rows);
      if (all.length > WAVEPAY_MAX_ORDERS) throw inventoryError(`ช่วงนี้มีเกิน ${WAVEPAY_MAX_ORDERS.toLocaleString("en-US")} ออเดอร์ กรุณาลดช่วงวันที่`, 413);
      if (rows.length < BATCH) return all;
      cursor = String(rows.at(-1).id);
    }
  }
  // Latest order per SIM, whatever the date range: its newBalance is the bot's last known balance.
  async function latestBalances() {
    return select(`SELECT ${orderColumns}
      FROM (SELECT DISTINCT ON (${WAVE_PHONE_SQL}) c.* FROM codashop_orders c
        WHERE c.payment_method=$1 AND c.status='completed' ORDER BY ${WAVE_PHONE_SQL}, c.created_at DESC, c.id DESC) c
      ${orderJoins}`, [WAVEPAY_METHOD]);
  }
  return {
    async list(actor, query = {}) {
      if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู WavePay Inventory", 403);
      const filters = waveFilters(query);
      const [rows, latest] = await Promise.all([rangeOrders(filters.bounds), latestBalances()]);
      const enriched = [];
      for (let i = 0; i < rows.length; i += BATCH) enriched.push(...await attachSheetFields(select, rows.slice(i, i + BATCH)));
      // Same sale conversion as USDCodashop, but nothing is stored: foreign-currency sales use today's reference rate.
      const prepared = await prepareSales(enriched.map((row) => ({ sourceId: String(row.id), row, details: row.sheet_fields })), []);
      const entries = prepared.map((p) => normalizeWaveOrder({ ...p.row, sheet_fields: p.details }));
      const lines = summarizeWaveLines(entries, latest);
      const shown = entries.filter((e) => (filters.phone == null || e.phone === filters.phone) && waveMatches(e, filters.search))
        .sort((a, b) => (b.occurredAt || "").localeCompare(a.occurredAt || "") || Number(b.id) - Number(a.id));
      const offset = (filters.page - 1) * WAVEPAY_PAGE_SIZE;
      return { dateFrom: filters.dateFrom, dateTo: filters.dateTo, lines, phone: filters.phone, total: shown.length, page: filters.page, pageSize: WAVEPAY_PAGE_SIZE,
        entries: shown.slice(offset, offset + WAVEPAY_PAGE_SIZE), observedAt: new Date().toISOString() };
    },
  };
}

let repository;
export const wavePayInventory = () => repository ||= createWavePayInventory();
