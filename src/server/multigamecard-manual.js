import { createHash } from "node:crypto";
import { getPool } from "@/lib/db";
import { inventoryError, canViewUsdInventory, canManageUsdInventory, usdCents, centsUsd } from "@/lib/usdcodashop-inventory";
import { mgcManualInput, mgcStatus, MGC_MAX_ORDERS } from "@/lib/multigamecard-inventory";
import { sheetFigures } from "@/lib/usdcodashop-sheet";

const schemas = new WeakMap();
async function ensure(pool) {
  if (!schemas.has(pool)) schemas.set(pool, (async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query("SELECT pg_advisory_xact_lock(hashtext('gamedb-mgc-schema'))");
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_mgc_cards (
        id BIGSERIAL PRIMARY KEY, serial TEXT UNIQUE NOT NULL, owner_label TEXT NOT NULL,
        in_points NUMERIC(14,2) NOT NULL CHECK(in_points>=0), out_points NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(out_points>=0),
        balance_points NUMERIC(14,2) NOT NULL CHECK(balance_points>=0),
        created_by INTEGER NOT NULL, created_by_label TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK(balance_points=in_points-out_points))`);
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_mgc_entries (
        id BIGSERIAL PRIMARY KEY, card_id BIGINT NOT NULL REFERENCES gamedb_mgc_cards(id),
        request_id UUID UNIQUE NOT NULL, request_hash TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('opening','deposit','use')), order_label TEXT NOT NULL,
        amount NUMERIC(14,2) NOT NULL CHECK(amount>=0 AND (kind='opening' OR amount>0)),
        balance_after NUMERIC(14,2) NOT NULL CHECK(balance_after>=0), details JSONB NOT NULL,
        actor_id INTEGER NOT NULL, actor_label TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query("CREATE INDEX IF NOT EXISTS gamedb_mgc_entries_date ON gamedb_mgc_entries(occurred_at,id)");
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  })().catch(e => { schemas.delete(pool); throw e; }));
  await schemas.get(pool);
}
export function createMgcManual(pool) {
  return {
    async read(actor, filters) {
      if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Multigamecard", 403);
      await ensure(pool);
      const { rows } = await pool.query(`WITH card_rows AS (
        SELECT id::text,serial,owner_label AS owner,in_points::text AS "inTotal",out_points::text AS "outTotal",
          balance_points::text AS balance,
          COALESCE((SELECT MAX(e.occurred_at) FROM gamedb_mgc_entries e WHERE e.card_id=gamedb_mgc_cards.id),created_at) AS "balanceAt"
          FROM gamedb_mgc_cards
      ), entries AS (
        SELECT e.id::text,e.kind,c.serial,e.order_label AS "orderId",e.amount::text,
          e.balance_after::text AS balance,e.details,e.actor_label AS "recordedBy",e.occurred_at AS "occurredAt"
        FROM gamedb_mgc_entries e JOIN gamedb_mgc_cards c ON c.id=e.card_id
        WHERE e.occurred_at >= $1::timestamptz AND e.occurred_at < $2::timestamptz
        ORDER BY e.occurred_at DESC,e.id DESC LIMIT ${MGC_MAX_ORDERS + 1}
      ) SELECT COALESCE((SELECT jsonb_agg(c ORDER BY c.serial) FROM card_rows c),'[]'::jsonb) AS cards,
        COALESCE((SELECT jsonb_agg(e ORDER BY e."occurredAt" DESC,e.id::bigint DESC) FROM entries e),'[]'::jsonb) AS entries`,
      [filters.bounds.start, filters.bounds.end]);
      const result = rows[0];
      if (result.entries.length > MGC_MAX_ORDERS) throw inventoryError("มีเกิน 20,000 รายการ กรุณาลดช่วงวันที่", 413);
      return { cards: result.cards.map(c => ({ ...c, status: mgcStatus(c.balance), enabled: true, duplicate: false })),
        entries: result.entries.map(e => ({ ...e, figures: e.kind === "use" ? sheetFigures(e.details) : { sale: null, cost: null, profit: null, margin: null } })) };
    },
    async save(body, actor) {
      if (!canManageUsdInventory(actor)) throw inventoryError("เฉพาะ Projectm Admin จึงบันทึก Manual ได้", 403);
      const input = mgcManualInput(body);
      const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      const actorLabel = actor.displayName || actor.username || `User #${actor.id}`;
      await ensure(pool);
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SET LOCAL lock_timeout='5s'");
        // A request lock covers simultaneous retries even when they name different cards.
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`mgc-request:${input.requestId}`]);
        const previous = (await c.query("SELECT id,request_hash,actor_id FROM gamedb_mgc_entries WHERE request_id=$1", [input.requestId])).rows[0];
        if (previous) {
          if (previous.request_hash !== hash || String(previous.actor_id) !== String(actor.id)) throw inventoryError("รหัสคำขอนี้ถูกใช้กับรายการอื่นแล้ว", 409);
          await c.query("COMMIT"); return { id: String(previous.id), replayed: true };
        }
        let card;
        const amount = usdCents(input.amount);
        if (input.action === "card") {
          card = (await c.query(`INSERT INTO gamedb_mgc_cards(serial,owner_label,in_points,balance_points,created_by,created_by_label)
            VALUES($1,$2,$3,$3,$4,$5) RETURNING id,balance_points`, [input.serial, input.owner, input.amount, actor.id, actorLabel])).rows[0];
        } else {
          card = (await c.query("SELECT id,balance_points,in_points,out_points FROM gamedb_mgc_cards WHERE id=$1 FOR UPDATE", [input.cardId])).rows[0];
          if (!card) throw inventoryError("ไม่พบบัตร Manual", 404);
          const balance = usdCents(card.balance_points);
          if (input.action === "use" && amount > balance) throw inventoryError("แต้มคงเหลือไม่พอ ไม่มีการบันทึกยอดออก", 409);
          const next = input.action === "use" ? balance - amount : balance + amount;
          const incoming = usdCents(card.in_points) + (input.action === "deposit" ? amount : 0n);
          const outgoing = usdCents(card.out_points) + (input.action === "use" ? amount : 0n);
          for (const n of [next, incoming, outgoing]) usdCents(centsUsd(n));
          await c.query("UPDATE gamedb_mgc_cards SET balance_points=$2,in_points=$3,out_points=$4 WHERE id=$1",
            [card.id, centsUsd(next), centsUsd(incoming), centsUsd(outgoing)]);
          card.balance_points = centsUsd(next);
        }
        const details = { ...(input.details || {}), note: input.note };
        const { rows } = await c.query(`INSERT INTO gamedb_mgc_entries(card_id,request_id,request_hash,kind,order_label,amount,balance_after,details,actor_id,actor_label)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING id`,
        [card.id, input.requestId, hash, input.action === "card" ? "opening" : input.action,
          input.orderId || (input.action === "card" ? "ยอดยกมา" : "แต้มเข้า"), input.amount, card.balance_points, JSON.stringify(details), actor.id, actorLabel]);
        await c.query("COMMIT"); return { id: String(rows[0].id), replayed: false };
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        if (e.code === "23505") throw inventoryError("Serial นี้มีในระบบ Manual แล้ว กรุณาตรวจประวัติก่อนบันทึกซ้ำ", 409);
        throw e;
      } finally { c.release(); }
    },
  };
}
let repo;
export const mgcManual = () => repo ||= createMgcManual(getPool());
