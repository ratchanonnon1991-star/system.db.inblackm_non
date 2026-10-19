import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { enrichShellOrders, saleJoin } from "@/server/garena-shell-inventory";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { allocateShellSale } from "@/lib/garena-shell-inventory";
import { NETEASE_ACCOUNTS, NETEASE_PAGE_SIZE, neteaseFilters, neteaseOrder, resolveNeteaseAccount,
  neteaseAmount, neteaseTotalUsage, groupNeteaseOrders, neteaseMatches, neteaseSummary } from "@/lib/netease-inventory";

// No credentials, receipt URLs, raw provider responses or session payloads are selected.
const columns = `n.id AS history_id,c.id,n.purchase_email,n.currency,n.old_balance,n.deducted,n.new_balance,
  n.game_name,n.pack_name,n.netease_order_no,n.created_at AS occurred_at,n.balance_received_at,
  c.source_order_id,c.source,split_part(c.source_order_id::text,':',1) AS source_base`;
const BATCH = 500;

export function createNeteaseInventory({ select = selectQuery, enrich = enrichShellOrders, prepareSales = prepareCodaSales } = {}) {
  return { async list(actor, query, { exportAll = false } = {}) {
    if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Netease Inventory", 403);
    const filters = neteaseFilters(query);
    const latest = await select(`SELECT DISTINCT ON (lower(btrim(n.purchase_email)),COALESCE(n.currency,'')) ${columns}
      FROM netease_purchase_history n LEFT JOIN codashop_orders c ON c.id=n.order_id
      ORDER BY lower(btrim(n.purchase_email)),COALESCE(n.currency,''),COALESCE(n.balance_received_at,n.created_at) DESC,n.id DESC`);
    const rows = []; let cursor = "0";
    for (;;) {
      const batch = await select(`SELECT ${columns},t.sale_ambiguous,t.order_id AS sale_order_id,t.price::text AS sale_price,
        t.source AS telegram_source,t.method,COALESCE(NULLIF(c.uid,''),t.uid) AS player_id,
        COALESCE(NULLIF(t.admin,''),NULLIF(t.booked_by,''),'Bot') AS operator
        FROM netease_purchase_history n LEFT JOIN codashop_orders c ON c.id=n.order_id ${saleJoin}
        WHERE n.id>$1::bigint AND n.created_at >= $2::timestamptz AND n.created_at < $3::timestamptz
        ORDER BY n.id LIMIT ${BATCH}`, [cursor, filters.bounds.start, filters.bounds.end]);
      rows.push(...batch);
      if (rows.length > 20000) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
      if (batch.length < BATCH) break;
      cursor = String(batch.at(-1).history_id);
    }
    if (new Set(rows.map((r) => String(r.history_id))).size !== rows.length) throw inventoryError("พบประวัติซ้ำ ต้องตรวจสอบก่อนรวมยอด", 409);
    // A coda packet may have several purchase receipts; allocate its sale only once.
    const ids = [...new Set(rows.map((r) => String(r.id)).filter((id) => /^\d+$/.test(id)))];
    const receiptGroups = new Map();
    for (let i = 0; i < ids.length; i += BATCH) {
      const groups = await select(`SELECT order_id,ARRAY_AGG(id ORDER BY id) AS history_ids
        FROM netease_purchase_history WHERE order_id=ANY($1::bigint[]) GROUP BY order_id`, [ids.slice(i, i + BATCH)]);
      for (const g of groups) receiptGroups.set(String(g.order_id), (g.history_ids || []).map(String));
    }
    const enriched = [];
    for (let i = 0; i < rows.length; i += BATCH) enriched.push(...await enrich(select, rows.slice(i, i + BATCH)));
    const prepared = await prepareSales(enriched.map((row) => ({ sourceId: String(row.history_id), row, details: row.sheet_fields })), []);
    const entries = groupNeteaseOrders(prepared.map(({ row, details }) => {
      const packet = allocateShellSale(details), receipts = receiptGroups.get(String(row.id)) || [];
      const allocated = allocateShellSale({ ...packet, saleAllocation: { count: receipts.length, position: receipts.indexOf(String(row.history_id)) } });
      // Preserve full customer payment evidence even after the nested receipt allocation.
      return neteaseOrder({ ...row, sheet_fields: { ...allocated, saleTotalThb: packet.saleTotalThb,
        salePacks: Math.max(packet.salePacks || 1, receipts.length) } }, filters.rates);
    }), filters.rates);
    const cards = NETEASE_ACCOUNTS.map((account) => {
      const candidates = latest.filter((r) => resolveNeteaseAccount(r)?.id === account.id)
        .sort((a, b) => Date.parse(b.balance_received_at || b.occurred_at) - Date.parse(a.balance_received_at || a.occurred_at) || Number(b.history_id) - Number(a.history_id));
      const row = candidates[0], inPeriod = entries.filter((e) => e.account === account.id);
      const pending = !account.email || entries.some((e) => e.account === "unmapped" && e.email === account.email && (!e.currency || e.currency === account.currency));
      return { ...account, rate: filters.rates[account.id] || account.rate || account.divisor,
        balance: row ? neteaseAmount(row.new_balance) : null, balanceAt: row ? new Date(row.balance_received_at || row.occurred_at).toISOString() : null,
        ...neteaseSummary(inPeriod), pending, orders: pending ? null : inPeriod.length, used: pending ? null : neteaseTotalUsage(inPeriod) };
    });
    const matched = entries.filter((e) => (!filters.account || e.account === filters.account) && neteaseMatches(e, filters.search))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || Number(b.id) - Number(a.id));
    const offset = (filters.page - 1) * NETEASE_PAGE_SIZE;
    return { dateFrom: filters.dateFrom, dateTo: filters.dateTo, cards, summary: neteaseSummary(matched),
      unassigned: entries.filter((e) => e.account === "unmapped").length, total: matched.length,
      page: filters.page, pageSize: NETEASE_PAGE_SIZE, entries: exportAll ? matched : matched.slice(offset, offset + NETEASE_PAGE_SIZE) };
  } };
}
let repository;
export const neteaseInventory = () => repository ||= createNeteaseInventory();
