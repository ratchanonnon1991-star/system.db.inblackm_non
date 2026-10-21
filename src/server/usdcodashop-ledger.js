import { getPool } from "@/lib/db";
import { canViewUsdInventory, canManageUsdInventory, inventoryError, usdCents, centsUsd } from "@/lib/usdcodashop-inventory";
import { CODA_BOUNDARY, signedUsd, normalizeCodaOrder, depositInput, providerUsd } from "@/lib/usdcodashop-ledger";
import { createCodaSource } from "@/server/usdcodashop-source";
import { retainSaleQuote, stableMetadata } from "@/lib/usdcodashop-sale-conversion";
import { prepareCodaSales } from "@/server/usdcodashop-sale-rates";
import { codaDateBounds, CODA_EXPORT_LIMIT } from "@/lib/usdcodashop-report";
import { codaEntryKind } from "@/lib/usdcodashop-overview";
import { codaCostQuote, codaCurrentCostFigures } from "@/lib/usdcodashop-cost";
import { loadCodaCostRate } from "@/server/usdcodashop-cost-rate";
import { codaProfitFilter } from "@/lib/usdcodashop-profit-filter";
import { allocateCodaReceipt } from "@/lib/usdcodashop-group";

const schemas = new WeakMap();
export async function ensureCodaLedger(pool) {
  if (!schemas.has(pool)) schemas.set(pool, (async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query("SET LOCAL statement_timeout='15s'");
      await c.query("SELECT pg_advisory_xact_lock(hashtext('gamedb-coda-ledger-schema'))");
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_coda_wallet (
        id INTEGER PRIMARY KEY CHECK(id=1), boundary_label TEXT NOT NULL,
        boundary_id BIGINT NOT NULL, opening NUMERIC(14,2) NOT NULL CHECK(opening>=0),
        created_by INTEGER NOT NULL, created_by_label TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_sync TIMESTAMPTZ)`);
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_coda_ledger (
        id BIGSERIAL PRIMARY KEY, wallet_id INTEGER NOT NULL DEFAULT 1 REFERENCES gamedb_coda_wallet(id),
        kind TEXT NOT NULL CHECK(kind IN ('order','deposit')),
        source_id BIGINT UNIQUE, request_id UUID UNIQUE, order_label TEXT NOT NULL,
        amount NUMERIC(14,2) NOT NULL CHECK(amount>0), occurred_at TIMESTAMPTZ NOT NULL,
        details JSONB NOT NULL, actor_id INTEGER NOT NULL, actor_label TEXT NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK((kind='order' AND source_id IS NOT NULL AND request_id IS NULL) OR
          (kind='deposit' AND source_id IS NULL AND request_id IS NOT NULL)))`);
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_coda_sync_status (
        id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL,
        heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_success TIMESTAMPTZ,
        error_message TEXT, interval_seconds INTEGER NOT NULL)`);
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_coda_balance_audit (
        id BIGSERIAL PRIMARY KEY, entry_id BIGINT NOT NULL REFERENCES gamedb_coda_ledger(id),
        previous_balance TEXT, new_balance TEXT, actor_id INTEGER NOT NULL, actor_label TEXT NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_coda_details_audit (
        id BIGSERIAL PRIMARY KEY, entry_id BIGINT NOT NULL REFERENCES gamedb_coda_ledger(id),
        before_data JSONB NOT NULL, after_data JSONB NOT NULL, actor_id INTEGER NOT NULL,
        actor_label TEXT NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  })().catch((e) => { schemas.delete(pool); throw e; }));
  await schemas.get(pool);
}

export function createCodaLedger(pool, source = createCodaSource(), { prepareSales = prepareCodaSales, loadCostRate = loadCodaCostRate } = {}) {
  const guard = (actor, write = false) => {
    if (!(write ? canManageUsdInventory(actor) : canViewUsdInventory(actor))) throw inventoryError("ไม่มีสิทธิ์จัดการบัญชี USDCodashop", 403);
  };
  const transaction = async (fn) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query("SET LOCAL statement_timeout='15s'");
      await c.query("SELECT pg_advisory_xact_lock(hashtext('gamedb-coda-wallet-write'))");
      const result = await fn(c); await c.query("COMMIT"); return result;
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  };
  const actorLabel = (actor) => actor.displayName || actor.username || `User #${actor.id}`;
  return {
    async list(actor, { search = "", page = 1, dateFrom = "", dateTo = "", exportAll = false, kind = "all", ...profitOptions } = {}) {
      guard(actor); await ensureCodaLedger(pool);
      const bounds = codaDateBounds({ dateFrom, dateTo });
      const entryKind = codaEntryKind(kind);
      const profit = codaProfitFilter(profitOptions);
      const term = String(search ?? "").trim().slice(0, 200);
      const pageNumber = Math.max(1, Math.min(100000, Number.parseInt(page, 10) || 1));
      const costQuote = entryKind === "deposit" ? null : codaCostQuote(await Promise.resolve().then(() => loadCostRate()).catch(() => null));
      // One SQL snapshot keeps totals and running balances consistent during concurrent syncs.
      const { rows } = await pool.query(`WITH duplicate_invoices AS (
          SELECT btrim(tx) AS invoice FROM gamedb_coda_ledger
          CROSS JOIN LATERAL unnest(string_to_array(details->>'invoice',',')) tx
          WHERE kind='order' AND btrim(tx)<>'' GROUP BY btrim(tx) HAVING COUNT(DISTINCT id)>1
        ), ordered AS (
          SELECT l.*, COUNT(*) FILTER(WHERE kind='order') OVER(PARTITION BY order_label) AS order_occurrences,
            EXISTS(SELECT 1 FROM duplicate_invoices d WHERE d.invoice=ANY(
              SELECT btrim(tx) FROM unnest(string_to_array(l.details->>'invoice',',')) tx)) AS transaction_duplicate,
            w.opening + SUM(CASE WHEN kind='deposit' THEN amount ELSE -amount END)
            OVER(ORDER BY l.occurred_at,l.id ROWS UNBOUNDED PRECEDING) AS balance
          FROM gamedb_coda_ledger l CROSS JOIN gamedb_coda_wallet w
        ), rolled AS (
          SELECT o.*,ROW_NUMBER() OVER customer_order AS group_rank,
            COUNT(*) OVER customer_order AS fill_count,SUM(amount) OVER customer_order AS group_amount,
            JSONB_AGG(to_jsonb(o)) OVER customer_order AS fills,
            BOOL_OR(transaction_duplicate) OVER customer_order AS group_transaction_duplicate,
            CASE WHEN COUNT(*) FILTER(WHERE NOT COALESCE(btrim(details->>'saleThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$',FALSE)) OVER customer_order=0
              THEN SUM(CASE WHEN btrim(details->>'saleThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$' THEN round((details->>'saleThb')::numeric,2) END) OVER customer_order END AS group_sale,
            CASE WHEN COUNT(*) FILTER(WHERE NOT COALESCE(btrim(details->>'costThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$',FALSE)) OVER customer_order=0
              THEN SUM(CASE WHEN btrim(details->>'costThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$' THEN round((details->>'costThb')::numeric,2) END) OVER customer_order END AS group_original_cost
          FROM ordered o WINDOW customer_order AS (
            PARTITION BY kind,CASE WHEN kind='deposit' THEN id::text ELSE order_label END,
              COALESCE(NULLIF(lower(details->>'source'),''),'unknown:'||source_id::text)
            ORDER BY occurred_at DESC,source_id DESC NULLS LAST,id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
        ), grouped AS (
          SELECT id,kind,source_id,order_label,group_amount AS amount,occurred_at,recorded_at,actor_label,balance,
            1 AS order_occurrences,group_transaction_duplicate AS transaction_duplicate,fill_count,fills,
            CASE WHEN fill_count=1 THEN details ELSE
              (details - 'salePacks' - 'saleNative' - 'saleCurrency' - 'saleConversion' - 'saleAllocation') || jsonb_build_object(
                'saleThb',CASE WHEN (SELECT COUNT(DISTINCT ROW(
                    COALESCE(f->'details'->>'saleTotalThb',f->'details'->>'saleNative'),f->'details'->>'saleCurrency'))
                    FROM jsonb_array_elements(fills) f)>1 THEN NULL ELSE group_sale::text END,
                'costThb',group_original_cost::text,
                'game',(SELECT string_agg(DISTINCT f->'details'->>'game',' + ') FROM jsonb_array_elements(fills) f),
                'pack',(SELECT string_agg(DISTINCT f->'details'->>'pack',' + ') FROM jsonb_array_elements(fills) f),
                'invoice',(SELECT string_agg(DISTINCT f->'details'->>'invoice',', ') FROM jsonb_array_elements(fills) f)
              ) END AS details
          FROM rolled WHERE group_rank=1
        ), filtered AS (SELECT * FROM grouped WHERE ($1='' OR
          strpos(lower(concat_ws(' ',order_label,details->>'game',details->>'pack',details->>'operator',details->>'invoice',details->>'customer',details->>'playerId',details->>'note')),lower($1))>0)
          AND ($3::timestamptz IS NULL OR occurred_at >= $3::timestamptz)
          AND ($4::timestamptz IS NULL OR occurred_at < $4::timestamptz)
          AND ($6::text='all' OR kind=$6::text)), figures AS (
          SELECT *,
            CASE WHEN btrim(details->>'saleThb') ~ '^[0-9]{1,12}([.][0-9]{1,20})?$'
              THEN round(btrim(details->>'saleThb')::numeric,2) END AS sale_thb,
            CASE WHEN kind='order' AND $7::numeric IS NOT NULL AND round(amount*$7::numeric,2)<=999999999999.99
              THEN round(amount*$7::numeric,2) END AS cost_thb
          FROM filtered
        ), measured AS (
          SELECT *, CASE WHEN kind='order' THEN
            CASE WHEN $9::text='percent' THEN round((sale_thb-cost_thb)/NULLIF(sale_thb,0)*100,2)
              ELSE sale_thb-cost_thb END END AS profit_value
          FROM figures
        ), matched AS (
          SELECT * FROM measured WHERE
            ($8::text='all' AND $10::numeric IS NULL AND $11::numeric IS NULL)
            OR (kind='order'
              AND ($8::text='all' OR ($8::text='profit' AND profit_value>0)
                OR ($8::text='loss' AND profit_value<0) OR ($8::text='breakeven' AND profit_value=0)
                OR ($8::text='missing' AND profit_value IS NULL))
              AND ($10::numeric IS NULL OR profit_value >= $10::numeric)
              AND ($11::numeric IS NULL OR profit_value <= $11::numeric))
        )
        SELECT w.*,
          COALESCE((SELECT SUM(amount) FROM ordered WHERE kind='deposit'),0)::text AS deposits,
          COALESCE((SELECT SUM(amount) FROM ordered WHERE kind='order'),0)::text AS used,
          (SELECT COUNT(*)::int FROM matched) AS total,
          (SELECT jsonb_build_object(
            'orders',COUNT(*) FILTER(WHERE kind='order'),
            'deposits',COUNT(*) FILTER(WHERE kind='deposit'),
            'sale',CASE WHEN COUNT(*) FILTER(WHERE kind='order' AND sale_thb IS NULL)=0
              THEN COALESCE(SUM(sale_thb) FILTER(WHERE kind='order'),0)::text END,
            'cost',CASE WHEN COUNT(*) FILTER(WHERE kind='order' AND cost_thb IS NULL)=0
              THEN COALESCE(SUM(cost_thb) FILTER(WHERE kind='order'),0)::text END,
            'profit',CASE WHEN COUNT(*) FILTER(WHERE kind='order' AND (sale_thb IS NULL OR cost_thb IS NULL))=0
              THEN COALESCE(SUM(sale_thb-cost_thb) FILTER(WHERE kind='order'),0)::text END,
            'missingSales',COUNT(*) FILTER(WHERE kind='order' AND sale_thb IS NULL),
            'missingCosts',COUNT(*) FILTER(WHERE kind='order' AND cost_thb IS NULL),
            'duplicateOrders',COUNT(*) FILTER(WHERE kind='order' AND order_occurrences>1),
            'duplicateTransactions',COUNT(*) FILTER(WHERE kind='order' AND transaction_duplicate),
            'depositUsd',COALESCE(SUM(amount) FILTER(WHERE kind='deposit'),0)::text,
            'usedUsd',COALESCE(SUM(amount) FILTER(WHERE kind='order'),0)::text
          ) FROM matched) AS summary,
          COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC,x.id DESC) FROM
            (SELECT * FROM matched ORDER BY occurred_at DESC,id DESC LIMIT $5 OFFSET $2) x),'[]'::jsonb) AS entries
        , (SELECT row_to_json(s) FROM gamedb_coda_sync_status s WHERE s.id=1) AS auto_sync
        , (SELECT jsonb_build_object('balance',details->>'providerBalance','orderId',order_label,'occurredAt',occurred_at)
           FROM ordered WHERE kind='order' ORDER BY occurred_at DESC,source_id DESC LIMIT 1) AS latest_provider
        FROM gamedb_coda_wallet w WHERE w.id=1`, [term, exportAll ? 0 : (pageNumber - 1) * 100, bounds.start, bounds.end, exportAll ? CODA_EXPORT_LIMIT + 1 : 100, entryKind, costQuote?.rate || null,
          profit.profitStatus, profit.profitUnit, profit.profitMin || null, profit.profitMax || null]);
      const r = rows[0];
      if (!r) return { configured: false, canManage: canManageUsdInventory(actor), entries: [] };
      if (exportAll && r.total > CODA_EXPORT_LIMIT) throw inventoryError("Export ได้สูงสุด 50,000 รายการต่อครั้ง กรุณาลดช่วงวันที่ (ยังไม่ได้ส่งออกไฟล์)", 413);
      const opening = usdCents(r.opening); const deposits = usdCents(r.deposits); const used = usdCents(r.used);
      return { configured: true, canManage: canManageUsdInventory(actor), boundary: r.boundary_label,
        opening: centsUsd(opening), deposits: centsUsd(deposits), used: centsUsd(used),
        remaining: providerUsd(r.latest_provider?.balance),
        calculatedRemaining: signedUsd(opening + deposits - used),
        balanceAsOf: r.latest_provider?.occurredAt || null, balanceOrderId: r.latest_provider?.orderId || null,
        lastSync: r.last_sync,
        autoSync: r.auto_sync || null,
        page: pageNumber, total: r.total, summary: r.summary, costQuote,
        entries: r.entries.map((e) => ({ id: String(e.id), kind: e.kind, orderId: e.order_label,
          amount: e.amount, balance: e.kind === "order" ? providerUsd(e.details.providerBalance) : null,
          calculatedBalance: e.balance, occurredAt: e.occurred_at, recordedAt: e.recorded_at,
          figures: codaCurrentCostFigures({ kind: e.kind, amount: e.amount, details: e.details }, costQuote), orderDuplicate: Number(e.order_occurrences) > 1, transactionDuplicate: Boolean(e.transaction_duplicate),
          fillCount: Number(e.fill_count || 1),
          fills: (e.fills || []).map((f) => ({ id: String(f.id), sourceId: String(f.source_id || ""), amount: f.amount,
            occurredAt: f.occurred_at, balance: providerUsd(f.details?.providerBalance), details: f.details,
            figures: codaCurrentCostFigures({ kind: f.kind, amount: f.amount, details: f.details }, costQuote), transactionDuplicate: Boolean(f.transaction_duplicate) })),
          details: { ...e.details, costConversion: e.kind === "order" ? costQuote : null }, recordedBy: e.actor_label })) };
    },
    async setup(body, actor) {
      guard(actor, true);
      if (body?.confirm !== true || body.boundary !== CODA_BOUNDARY) throw inventoryError("ยืนยันยอดยกมาหลัง K7306171 ก่อนเริ่ม");
      const opening = centsUsd(usdCents(body.opening));
      const boundaryId = await source.boundary();
      await ensureCodaLedger(pool);
      return transaction(async (c) => {
        const previous = (await c.query("SELECT * FROM gamedb_coda_wallet WHERE id=1 FOR UPDATE")).rows[0];
        if (previous) {
          if (String(previous.boundary_id) === boundaryId && centsUsd(usdCents(previous.opening)) === opening) return { configured: true };
          throw inventoryError("ตั้งค่ายอดยกมาไว้แล้ว ไม่อนุญาตเขียนทับประวัติ", 409);
        }
        await c.query(`INSERT INTO gamedb_coda_wallet(id,boundary_label,boundary_id,opening,created_by,created_by_label)
          VALUES(1,$1,$2,$3,$4,$5)`, [CODA_BOUNDARY, boundaryId, opening, actor.id, actorLabel(actor)]);
        return { configured: true };
      });
    },
    async sync(actor) {
      guard(actor, true); await ensureCodaLedger(pool);
      const wallet = (await pool.query("SELECT * FROM gamedb_coda_wallet WHERE id=1")).rows[0];
      if (!wallet) throw Object.assign(inventoryError("ตั้งค่ายอดยกมาก่อนซิงก์", 409), { code: "CODA_NOT_CONFIGURED" });
      const boundaryId = await source.boundary();
      if (boundaryId !== String(wallet.boundary_id)) throw inventoryError("รายการอ้างอิงต้นทางเปลี่ยน จึงหยุดซิงก์เพื่อป้องกันยอดผิด", 409);
      const sourceOrders = (await source.orders(boundaryId)).map(normalizeCodaOrder);
      const previousRows = (await pool.query("SELECT source_id,details FROM gamedb_coda_ledger WHERE kind='order'")).rows;
      // Fetch reference rates before taking the financial write lock; rate failures do not block USD history.
      const orders = (await prepareSales(sourceOrders, previousRows)).map((o) => ({ ...o, details: allocateCodaReceipt(o.details) }));
      if (orders.some((o) => BigInt(o.sourceId) <= BigInt(boundaryId))) throw inventoryError("ต้นทางส่งรายการก่อนจุดเริ่มต้น จึงหยุดซิงก์", 409);
      return transaction(async (c) => {
        let added = 0; let balancesUpdated = 0;
        for (const o of orders) {
          const result = await c.query(`INSERT INTO gamedb_coda_ledger(kind,source_id,order_label,amount,occurred_at,details,actor_id,actor_label)
            VALUES('order',$1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT(source_id) DO NOTHING RETURNING id`,
          [o.sourceId, o.orderId, o.amount, o.occurredAt, JSON.stringify(o.details), actor.id, actorLabel(actor)]);
          if (result.rows.length) added++;
          else {
            const old = (await c.query("SELECT id,amount,details FROM gamedb_coda_ledger WHERE source_id=$1", [o.sourceId])).rows[0];
            if (!old || usdCents(old.amount) !== usdCents(o.amount)) throw inventoryError(`Order ${o.orderId}: ยอดต้นทางเปลี่ยน กรุณาตรวจสอบก่อนปรับยอด`, 409);
            o.details = allocateCodaReceipt(retainSaleQuote(o.details, old.details));
            if (providerUsd(old.details.providerBalance) !== o.details.providerBalance) {
              await c.query(`INSERT INTO gamedb_coda_balance_audit(entry_id,previous_balance,new_balance,actor_id,actor_label)
                VALUES($1,$2,$3,$4,$5)`, [old.id, old.details.providerBalance ?? null, o.details.providerBalance, actor.id, actorLabel(actor)]);
              await c.query("UPDATE gamedb_coda_ledger SET details=jsonb_set(details,'{providerBalance}',$2::jsonb) WHERE id=$1",
                [old.id, JSON.stringify(o.details.providerBalance)]);
              balancesUpdated++;
            }
            const beforeMetadata = { ...old.details }; const afterMetadata = { ...o.details };
            delete beforeMetadata.providerBalance; delete afterMetadata.providerBalance;
            const stable = (value) => JSON.stringify(stableMetadata(value));
            if (stable(beforeMetadata) !== stable(afterMetadata)) {
              await c.query(`INSERT INTO gamedb_coda_details_audit(entry_id,before_data,after_data,actor_id,actor_label)
                VALUES($1,$2::jsonb,$3::jsonb,$4,$5)`, [old.id, JSON.stringify(old.details), JSON.stringify(o.details), actor.id, actorLabel(actor)]);
              await c.query("UPDATE gamedb_coda_ledger SET details=$2::jsonb WHERE id=$1", [old.id, JSON.stringify(o.details)]);
            }
          }
        }
        await c.query("UPDATE gamedb_coda_wallet SET last_sync=NOW() WHERE id=1");
        return { added, checked: orders.length, balancesUpdated };
      });
    },
    async recordWorkerStatus(actor, { state, error = null, intervalSeconds = 60 }) {
      guard(actor, true);
      if (!["syncing", "ok", "waiting", "error", "stopped"].includes(state) || intervalSeconds !== 60) throw inventoryError("สถานะ worker ไม่ถูกต้อง");
      await ensureCodaLedger(pool);
      await pool.query(`INSERT INTO gamedb_coda_sync_status(id,state,error_message,interval_seconds,last_success)
        VALUES(1,$1,$2,$3,CASE WHEN $1='ok' THEN NOW() ELSE NULL END)
        ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,error_message=EXCLUDED.error_message,
          interval_seconds=EXCLUDED.interval_seconds,heartbeat=NOW(),
          last_success=CASE WHEN EXCLUDED.state='ok' THEN NOW() ELSE gamedb_coda_sync_status.last_success END`,
      [state, error == null ? null : String(error).slice(0, 400), intervalSeconds]);
    },
    async deposit(body, actor) {
      guard(actor, true); const value = depositInput(body); await ensureCodaLedger(pool);
      return transaction(async (c) => {
        if (!(await c.query("SELECT id FROM gamedb_coda_wallet WHERE id=1 FOR UPDATE")).rows.length) throw inventoryError("ตั้งค่ายอดยกมาก่อนเติมเงิน", 409);
        const old = (await c.query("SELECT * FROM gamedb_coda_ledger WHERE request_id=$1", [body.requestId])).rows[0];
        if (old) {
          if (String(old.actor_id) !== String(actor.id) || usdCents(old.amount) !== usdCents(value.amount) || old.details.note !== value.note) throw inventoryError("รหัสคำขอถูกใช้แล้ว", 409);
          return { id: String(old.id) };
        }
        const { rows } = await c.query(`INSERT INTO gamedb_coda_ledger(kind,request_id,order_label,amount,occurred_at,details,actor_id,actor_label)
          VALUES('deposit',$1,'เติมเงิน',$2,NOW(),$3::jsonb,$4,$5) RETURNING id`,
        [body.requestId, value.amount, JSON.stringify({ note: value.note }), actor.id, actorLabel(actor)]);
        return { id: String(rows[0].id) };
      });
    },
  };
}
let repository;
export const codaLedgerRepository = () => repository ||= createCodaLedger(getPool());
