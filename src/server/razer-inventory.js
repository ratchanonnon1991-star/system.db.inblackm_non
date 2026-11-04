import { getPool } from "@/lib/db";
import { selectQuery } from "@/lib/profit-remote-db";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";
import { hasPermission } from "@/lib/permissions";
import { enrichShellOrders, saleJoin } from "@/server/garena-shell-inventory";
import { allocateShellSale } from "@/lib/garena-shell-inventory";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { RAZER_INVENTORY_ZONES, RAZER_INVENTORY_PAGE_SIZE, razerFilters, razerStockAccounts, razerWalletKey,
  razerOrder, groupRazerOrders, razerSummary, razerSum, razerMatches, razerLedgerOrder, razerManual,
  razerLedgerWallet, razerWithLedgerWallets, razerIdNumber, RAZER_MIXED_ZONE } from "@/lib/razer-inventory";

const selectStockRows = async (sql, params) => (await getPool().query(sql, params)).rows;
// The existing stock service's ensureSchema performs writes; this inventory must not call it.
const stockSql = `SELECT id,email,zone,rate,status,gold_balance,silver_balance,hidden,bot_enabled,last_synced_at,in_use_order_id
  FROM profit_razer_accounts WHERE zone=ANY($1::text[]) ORDER BY zone,email LIMIT 10001`;
// Explicit projections: no credentials, receipt URLs or raw provider/session payloads.
const columns = `n.id AS history_id,c.id,n.order_id AS bot_order_id,n.purchase_email,n.currency_code,n.old_balance_gold,n.deducted,
  n.new_balance_gold,n.new_balance_silver,n.game_name,n.pack_name,n.razer_order_no,n.transaction_id,
  n.created_at AS occurred_at,n.balance_received_at,n.completed_at,c.source_order_id,c.source,
  split_part(c.source_order_id::text,':',1) AS source_base`;
// Hand-fill uses from the inventory ledger (tools DB). Plain read: the ledger's own ensure() writes schema.
// Reversed uses are left out; deposits are not usage.
const ledgerSql = `SELECT e.id::text AS id,a.account_key,e.amount::text AS amount,e.order_ref,e.invoice,e.note,e.actor_label,
  e.occurred_at,e.thb_amount::text AS thb_amount,e.sale_thb::text AS sale_thb
  FROM gamedb_inv_entries e JOIN gamedb_inv_accounts a ON a.id=e.account_id
  WHERE a.provider='razer' AND e.kind='use' AND a.account_key LIKE ANY($3::text[])
    AND e.occurred_at >= $1::timestamptz AND e.occurred_at < $2::timestamptz
    AND NOT EXISTS (SELECT 1 FROM gamedb_inv_entries r WHERE r.reverses_entry_id=e.id)
  ORDER BY e.id LIMIT 20001`;
const ledgerWalletSql = `SELECT account_key FROM gamedb_inv_accounts WHERE provider='razer' AND account_key LIKE ANY($1::text[]) LIMIT 10001`;
const BATCH = 500;
export function createRazerInventory({ select = selectQuery, selectStock = selectStockRows, selectLedger = selectStockRows,
  enrich = enrichShellOrders, prepareSales = prepareCodaSales } = {}) {
  return { async list(actor, query = {}, { exportAll = false } = {}) {
    if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Razer Inventory", 403);
    const filters = razerFilters(query);
    let stock = [], stockAvailable = true;
    try { stock = await selectStock(stockSql, [RAZER_INVENTORY_ZONES]); }
    catch { stockAvailable = false; }
    if (stock.length > 10000) throw inventoryError("บัญชีเกิน 10,000 รายการ ต้องลดขอบเขตข้อมูล", 413);
    const latest = await select(`SELECT DISTINCT ON (lower(btrim(n.purchase_email)),n.currency_code) ${columns}
      FROM razer_purchase_history n LEFT JOIN codashop_orders c ON c.id=n.order_id
      WHERE n.status='completed' AND n.currency_code=ANY($1::text[])
      ORDER BY lower(btrim(n.purchase_email)),n.currency_code,COALESCE(n.balance_received_at,n.completed_at,n.created_at) DESC,n.id DESC`, [RAZER_INVENTORY_ZONES]);
    let ledgerAvailable = true;
    // 42P01: no ledger tables yet, so no hand fills; any other failure is shown, and the bot data still loads.
    const ledgerFailed = (e) => { if (e.code !== "42P01") ledgerAvailable = false; return []; };
    const ledgerWallets = await selectLedger(ledgerWalletSql, [RAZER_INVENTORY_ZONES.map((z) => `razer:${z}:%`)]).catch(ledgerFailed);
    if (ledgerWallets.length > 10000) throw inventoryError("บัญชีเกิน 10,000 รายการ ต้องลดขอบเขตข้อมูล", 413);
    const accounts = razerWithLedgerWallets(razerStockAccounts(stock, latest), ledgerWallets), byWallet = new Map(accounts.map((a) => [a.key, a]));
    // Date-range reads only load the chosen zone.
    const zones = filters.zone ? [filters.zone] : RAZER_INVENTORY_ZONES;
    const rows = []; let cursor = "0";
    for (;;) {
      const batch = await select(`SELECT ${columns},t.sale_ambiguous,t.order_id AS sale_order_id,t.price::text AS sale_price,
        t.source AS telegram_source,t.method,COALESCE(NULLIF(c.uid,''),t.uid) AS player_id,
        COALESCE(NULLIF(t.admin,''),NULLIF(t.booked_by,''),'Bot') AS operator
        FROM razer_purchase_history n LEFT JOIN codashop_orders c ON c.id=n.order_id ${saleJoin}
        WHERE n.status='completed' AND n.currency_code=ANY($1::text[]) AND n.id>$2::bigint
          AND n.created_at >= $3::timestamptz AND n.created_at < $4::timestamptz
        ORDER BY n.id LIMIT ${BATCH}`, [zones, cursor, filters.bounds.start, filters.bounds.end]);
      rows.push(...batch);
      if (rows.length > 20000) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
      if (batch.length < BATCH) break;
      cursor = String(batch.at(-1).history_id);
    }
    if (new Set(rows.map((r) => String(r.history_id))).size !== rows.length) throw inventoryError("พบประวัติซ้ำ ต้องตรวจสอบก่อนรวมยอด", 409);
    const ids = [...new Set(rows.map((r) => String(r.id)).filter((id) => /^\d+$/.test(id)))], receipts = new Map();
    for (let i = 0; i < ids.length; i += BATCH) {
      const groups = await select(`SELECT order_id,ARRAY_AGG(id ORDER BY id) AS history_ids FROM razer_purchase_history
        WHERE status='completed' AND order_id=ANY($1::bigint[]) GROUP BY order_id`, [ids.slice(i, i + BATCH)]);
      for (const g of groups) receipts.set(String(g.order_id), (g.history_ids || []).map(String));
    }
    const enriched = [];
    for (let i = 0; i < rows.length; i += BATCH) enriched.push(...await enrich(select, rows.slice(i, i + BATCH)));
    const prepared = await prepareSales(enriched.map((row) => ({ sourceId: String(row.history_id), row, details: row.sheet_fields })), []);
    const entries = groupRazerOrders(prepared.map(({ row, details }) => {
      const packet = allocateShellSale(details), list = receipts.get(String(row.id)) || [];
      const allocated = allocateShellSale({ ...packet, saleAllocation: { count: list.length, position: list.indexOf(String(row.history_id)) } });
      return razerOrder({ ...row, sheet_fields: { ...allocated, saleTotalThb: packet.saleTotalThb } },
        byWallet.get(razerWalletKey(row.purchase_email, row.currency_code)), filters.rates);
    }));
    const ledger = await selectLedger(ledgerSql, [filters.bounds.start, filters.bounds.end, zones.map((z) => `razer:${z}:%`)]).catch(ledgerFailed);
    if (rows.length + ledger.length > 20000) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
    for (const row of ledger) {
      const wallet = razerLedgerWallet(row.account_key);
      const entry = wallet && razerLedgerOrder(row, byWallet.get(razerWalletKey(wallet.email, wallet.zone)), filters.rates);
      if (entry) entries.push(entry);
    }
    const visible = accounts.filter((a) => (filters.showHidden || !a.hidden) && (!filters.status || (filters.status === "READY"
      ? a.status === "ACTIVE" && a.botEnabled === true && !a.inUse : a.status === filters.status))), visibleKeys = new Set(visible.map((a) => a.key));
    if (filters.account && !visibleKeys.has(filters.account)) throw inventoryError("ไม่พบบัญชีตามตัวกรอง");
    const matched = entries.filter((e) => (filters.showHidden || !byWallet.get(e.walletKey)?.hidden) && (!filters.status || visibleKeys.has(e.walletKey))
      && (!filters.zone || e.zone === filters.zone) && (!filters.account || e.walletKey === filters.account) && razerMatches(e, filters.search))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || razerIdNumber(b.id) - razerIdNumber(a.id));
    const choices = visible.filter((a) => !filters.zone || a.zone === filters.zone);
    const selectedAccounts = choices.filter((a) => (!filters.account || a.key === filters.account)
      && (!filters.search || a.email.includes(filters.search.toLowerCase()) || matched.some((e) => e.walletKey === a.key)));
    const accountOffset = (filters.accountPage - 1) * 50, offset = (filters.page - 1) * RAZER_INVENTORY_PAGE_SIZE;
    return { dateFrom: filters.dateFrom, dateTo: filters.dateTo, stockAvailable, ledgerAvailable, canOpenStock: hasPermission(actor, "profit.access"),
      zones: RAZER_INVENTORY_ZONES.map((zone) => {
        const list = visible.filter((a) => a.zone === zone), period = matched.filter((e) => e.zone === zone), manual = period.filter(razerManual);
        // Ledger-only wallets have no balance; OTHER mixes currencies, so its Gold is never summed.
        const balanced = list.filter((a) => a.balanceSource !== "ledger");
        const unknown = zone === RAZER_MIXED_ZONE || (!stockAvailable && !list.length) || (list.length > 0 && !balanced.length);
        // "used" stays the bot's Gold; hand fills are their own figure so neither is counted into the other.
        return { zone, mixed: zone === RAZER_MIXED_ZONE, accounts: list.length, noBalance: list.length - balanced.length,
          gold: unknown ? null : razerSum(balanced, (a) => a.gold), silver: unknown ? null : razerSum(balanced, (a) => a.silver),
          used: razerSum(period.filter((e) => !razerManual(e)), (e) => e.used), manualUsed: razerSum(manual, (e) => e.used), manualOrders: manual.length, ...razerSummary(period) };
      }), accountChoices: choices.map((a) => ({ key: a.key, email: a.email, zone: a.zone })),
      accounts: selectedAccounts.slice(accountOffset, accountOffset + 50), accountTotal: selectedAccounts.length, accountPage: filters.accountPage,
      entries: exportAll ? matched : matched.slice(offset, offset + RAZER_INVENTORY_PAGE_SIZE),
      total: matched.length, page: filters.page, pageSize: RAZER_INVENTORY_PAGE_SIZE, summary: razerSummary(matched) };
  } };
}
let repository;
export const razerInventory = () => repository ||= createRazerInventory();
