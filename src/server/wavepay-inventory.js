import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { attachSheetFields } from "@/server/usdcodashop-source";
import {
  WAVEPAY_MAX_ORDERS, WAVEPAY_METHOD, WAVEPAY_PAGE_SIZE, WAVE_PHONE_SQL, WAVE_NOT_CHARGED_CODE, wavePhoneSql,
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
  CASE WHEN jsonb_typeof(c.provider_response)='object' THEN c.provider_response->>'status' END AS bot_status,
  CASE WHEN jsonb_typeof(c.provider_response)='object' AND jsonb_typeof(c.provider_response->'error')='object'
    THEN c.provider_response->'error'->>'code' END AS bot_error_code,
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
  // Latest completed order per SIM that recorded a balance, whatever the date range: its newBalance is the bot's last
  // known balance. Completed orders after it without a balance are counted (and which of them the bot stopped before
  // paying), so the card can say how far that reading can be trusted instead of showing nothing.
  async function latestBalances() {
    return select(`SELECT ${orderColumns},later.later_orders,later.later_uncharged,later.later_at
      FROM (SELECT DISTINCT ON (${WAVE_PHONE_SQL}) c.* FROM codashop_orders c
        WHERE c.payment_method=$1 AND c.status='completed' AND jsonb_typeof(c.provider_response)='object'
          AND NULLIF(btrim(c.provider_response->'balances'->>'newBalance'),'') IS NOT NULL
        ORDER BY ${WAVE_PHONE_SQL}, c.created_at DESC, c.id DESC) c
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS later_orders,
          COUNT(*) FILTER (WHERE jsonb_typeof(x.provider_response->'error')='object'
            AND x.provider_response->'error'->>'code'=$2)::int AS later_uncharged,
          MAX(x.created_at) AS later_at
        FROM codashop_orders x WHERE x.payment_method=$1 AND x.status='completed'
          AND ${wavePhoneSql("x")}=${WAVE_PHONE_SQL} AND (x.created_at,x.id)>(c.created_at,c.id)) later ON TRUE
      ${orderJoins}`, [WAVEPAY_METHOD, WAVE_NOT_CHARGED_CODE]);
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
