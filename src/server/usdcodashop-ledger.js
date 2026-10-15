import { getPool } from "@/lib/db";
import { canViewUsdInventory, canManageUsdInventory, inventoryError, usdCents, centsUsd } from "@/lib/usdcodashop-inventory";
import { CODA_BOUNDARY, signedUsd, normalizeCodaOrder, depositInput } from "@/lib/usdcodashop-ledger";
import { createCodaSource } from "@/server/usdcodashop-source";

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
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  })().catch((e) => { schemas.delete(pool); throw e; }));
  await schemas.get(pool);
}

export function createCodaLedger(pool, source = createCodaSource()) {
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
    async list(actor, { search = "", page = 1 } = {}) {
      guard(actor); await ensureCodaLedger(pool);
      const term = String(search).trim().slice(0, 200);
      const pageNumber = Math.max(1, Math.min(100000, Number.parseInt(page, 10) || 1));
      // One SQL snapshot keeps totals and running balances consistent during concurrent syncs.
      const { rows } = await pool.query(`WITH ordered AS (
          SELECT l.*, w.opening + SUM(CASE WHEN kind='deposit' THEN amount ELSE -amount END)
            OVER(ORDER BY l.occurred_at,l.id ROWS UNBOUNDED PRECEDING) AS balance
          FROM gamedb_coda_ledger l CROSS JOIN gamedb_coda_wallet w
        ), filtered AS (SELECT * FROM ordered WHERE $1='' OR
          strpos(lower(concat_ws(' ',order_label,details->>'game',details->>'pack',details->>'operator',details->>'invoice',details->>'note')),lower($1))>0)
        SELECT w.*,
          COALESCE((SELECT SUM(amount) FROM ordered WHERE kind='deposit'),0)::text AS deposits,
          COALESCE((SELECT SUM(amount) FROM ordered WHERE kind='order'),0)::text AS used,
          (SELECT COUNT(*)::int FROM filtered) AS total,
          COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC,x.id DESC) FROM
            (SELECT * FROM filtered ORDER BY occurred_at DESC,id DESC LIMIT 100 OFFSET $2) x),'[]'::jsonb) AS entries
        , (SELECT row_to_json(s) FROM gamedb_coda_sync_status s WHERE s.id=1) AS auto_sync
        FROM gamedb_coda_wallet w WHERE w.id=1`, [term, (pageNumber - 1) * 100]);
      const r = rows[0];
      if (!r) return { configured: false, canManage: canManageUsdInventory(actor), entries: [] };
      const opening = usdCents(r.opening); const deposits = usdCents(r.deposits); const used = usdCents(r.used);
      return { configured: true, canManage: canManageUsdInventory(actor), boundary: r.boundary_label,
        opening: centsUsd(opening), deposits: centsUsd(deposits), used: centsUsd(used),
        remaining: signedUsd(opening + deposits - used), lastSync: r.last_sync,
        autoSync: r.auto_sync || null,
        page: pageNumber, total: r.total,
        entries: r.entries.map((e) => ({ id: String(e.id), kind: e.kind, orderId: e.order_label,
          amount: e.amount, balance: e.balance, occurredAt: e.occurred_at, recordedAt: e.recorded_at,
          details: e.details, recordedBy: e.actor_label })) };
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
      const orders = (await source.orders(boundaryId)).map(normalizeCodaOrder);
      if (orders.some((o) => BigInt(o.sourceId) <= BigInt(boundaryId))) throw inventoryError("ต้นทางส่งรายการก่อนจุดเริ่มต้น จึงหยุดซิงก์", 409);
      return transaction(async (c) => {
        let added = 0;
        for (const o of orders) {
          const result = await c.query(`INSERT INTO gamedb_coda_ledger(kind,source_id,order_label,amount,occurred_at,details,actor_id,actor_label)
            VALUES('order',$1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT(source_id) DO NOTHING RETURNING id`,
          [o.sourceId, o.orderId, o.amount, o.occurredAt, JSON.stringify(o.details), actor.id, actorLabel(actor)]);
          if (result.rows.length) added++;
          else {
            const old = (await c.query("SELECT amount FROM gamedb_coda_ledger WHERE source_id=$1", [o.sourceId])).rows[0];
            if (!old || usdCents(old.amount) !== usdCents(o.amount)) throw inventoryError(`Order ${o.orderId}: ยอดต้นทางเปลี่ยน กรุณาตรวจสอบก่อนปรับยอด`, 409);
          }
        }
        await c.query("UPDATE gamedb_coda_wallet SET last_sync=NOW() WHERE id=1");
        return { added, checked: orders.length };
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
