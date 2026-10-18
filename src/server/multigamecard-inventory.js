import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, canManageUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { mgcManual } from "@/server/multigamecard-manual";
import { mgcCostSettings } from "@/server/multigamecard-cost-settings";
import { attachSheetFields } from "@/server/usdcodashop-source";
import { prepareMgcSales } from "@/server/multigamecard-sale-rates";
import { mgcFilters, mgcPoints, mgcStatus, mgcOrder, mgcMatches, mgcSummary, MGC_PAGE_SIZE, MGC_MAX_ORDERS } from "@/lib/multigamecard-inventory";

const BATCH = 500;
// Pool membership is authoritative, even when old orders still contain MOL captures.
const belongs = `c.phone_number=ANY($1::text[])`;
const rawPoints = `btrim(c.provider_response->'payment'->'molGameCard'->>'redeemPoints')`;
const numericPoints = `replace(${rawPoints},',','')`;
const validPoints = `${rawPoints} ~ '^([0-9]{1,12}|[0-9]{1,3}(,[0-9]{3}){1,3})([.][0-9]{1,2})?$'`;
export function createMultigamecardInventory({ select = selectQuery, manual = mgcManual, settings = mgcCostSettings, prepareSales = prepareMgcSales } = {}) {
  async function bot(filters, costDivisor) {
    // Allowlist inside PostgreSQL: cardPin and other redeemable secrets never leave the source DB.
    const poolCards = await select(`SELECT card->>'cardSerial' AS serial,card->>'balance' AS balance,
      card->>'enabled' AS enabled,card->>'balanceUpdatedAt' AS balance_at
      FROM system_settings s CROSS JOIN LATERAL jsonb_array_elements(s.setting_value::jsonb->'cards') card
      WHERE s.setting_key=$1`, ["oxide_payment_card"]);
    const serials = [...new Set(poolCards.map(c => c.serial).filter(Boolean))];
    if (!serials.length) return { cards: [], entries: [] };
    const totals = await select(`SELECT c.phone_number AS serial,
      CASE WHEN COUNT(*)=COUNT(CASE WHEN ${validPoints} THEN 1 END)
        THEN SUM(CASE WHEN ${validPoints} THEN (${numericPoints})::numeric END)::text END AS used
      FROM codashop_orders c WHERE c.status='completed' AND ${belongs} GROUP BY c.phone_number`, [serials]);
    const rows = []; let cursor = "0";
    for (;;) {
      const batch = await select(`SELECT c.id,c.phone_number AS card_serial,c.source_order_id,c.game_name,c.pack_name,c.source,
        c.created_at AS occurred_at,c.invoice_txn_id AS invoice_number,
        c.provider_response->'payment'->'molGameCard'->>'redeemPoints' AS redeem_points,
        c.provider_response->'payment'->'molGameCard'->>'remainingBalance' AS remaining_points,
        t.order_id AS sale_order_id,t.price::text AS sale_price,t.source AS telegram_source,t.method,
        COALESCE(NULLIF(c.uid,''),t.uid) AS player_id,
        COALESCE(NULLIF(t.admin,''),NULLIF(t.booked_by,''),'Bot') AS operator
        FROM codashop_orders c LEFT JOIN telegram_orders_dev t ON t.task_request_id=c.telegram_task_request_id
        WHERE c.status='completed' AND ${belongs} AND c.id>$2::bigint
          AND c.created_at >= $3::timestamptz AND c.created_at < $4::timestamptz
        ORDER BY c.id LIMIT ${BATCH}`, [serials, cursor, filters.bounds.start, filters.bounds.end]);
      rows.push(...batch);
      if (rows.length > MGC_MAX_ORDERS) throw inventoryError("มีเกิน 20,000 ออเดอร์ กรุณาลดช่วงวันที่", 413);
      if (batch.length < BATCH) break;
      cursor = String(batch.at(-1).id);
    }
    if (new Set(rows.map(r => String(r.id))).size !== rows.length) throw inventoryError("พบข้อมูลคิวซ้ำจากต้นทาง กรุณาตรวจสอบก่อนรวมยอด", 409);
    const enriched = [];
    for (let i = 0; i < rows.length; i += BATCH) enriched.push(...await attachSheetFields(select, rows.slice(i, i + BATCH)));
    const prepared = await prepareSales(enriched.map(row => ({ sourceId: String(row.id), row, details: row.sheet_fields })), []);
    const counts = new Map();
    for (const c of poolCards) if (c.serial) counts.set(c.serial, (counts.get(c.serial) || 0) + 1);
    return { entries: prepared.map(p => mgcOrder({ ...p.row, sheet_fields: p.details }, costDivisor)),
      cards: serials.map(serial => {
        const source = poolCards.find(c => c.serial === serial), duplicate = (counts.get(serial) || 0) > 1;
        const usage = totals.find(t => t.serial === serial);
        const balance = source && !duplicate ? mgcPoints(source.balance) : null;
        return { id: serial, serial, owner: "Bot", inTotal: null,
          outTotal: mgcPoints(usage ? usage.used : source ? "0" : null),
          balance, balanceAt: source?.balance_at || null, enabled: Boolean(source && source.enabled !== "false"), duplicate,
          status: duplicate ? "Serial ซ้ำ" : mgcStatus(balance) };
      }).sort((a, b) => a.serial.localeCompare(b.serial)) };
  }
  return {
    async list(actor, query = {}, { exportAll = false } = {}) {
      if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Multigamecard", 403);
      const filters = mgcFilters(query);
      const costRate = filters.mode === "bot" ? await settings().read(actor) : null;
      const result = filters.mode === "bot" ? await bot(filters, costRate.divisor) : await manual().read(actor, filters);
      const matched = result.entries.filter(e => mgcMatches(e, filters))
        .sort((a, b) => String(b.occurredAt || "").localeCompare(String(a.occurredAt || "")) || Number(b.id) - Number(a.id));
      const offset = (filters.page - 1) * MGC_PAGE_SIZE;
      return { mode: filters.mode, canManage: canManageUsdInventory(actor), dateFrom: filters.dateFrom, dateTo: filters.dateTo,
        cards: result.cards, costRate, summary: mgcSummary(matched), total: matched.length, page: filters.page, pageSize: MGC_PAGE_SIZE,
        entries: exportAll ? matched : matched.slice(offset, offset + MGC_PAGE_SIZE), observedAt: new Date().toISOString() };
    },
    save: (body, actor) => body?.action === "cost-rate" ? settings().save(body, actor) : manual().save(body, actor),
  };
}
let repo;
export const multigamecardInventory = () => repo ||= createMultigamecardInventory();
