// Provider-agnostic inventory ledger: one registry of funding accounts (Razer
// wallets, MGC cards, WavePay numbers, provider top-up balances ...), an
// append-only list of movements that bots do not record themselves (deposits,
// fills done by a person, corrections), and balance snapshots that anchor the
// reconciliation. Not wired to any route or page yet; tables are created on
// first use only.
import { createHash } from "node:crypto";
import { getPool } from "@/lib/db";
import { canViewUsdInventory, canManageUsdInventory } from "@/lib/usdcodashop-inventory";
import {
  LEDGER_DIRECTION, LEDGER_MAX_BATCH, accountInput, entryInput, snapshotInput, debitBatchInput, ledgerError, orderSourceInput,
  toUnits, fromUnits, reconcile, costOfUse, profitThb,
} from "@/lib/inventory-ledger";

const MAX_ROWS = 20000;
const BACKDATE_DAYS = 31;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// Where each ledger kind shows up in a reconciliation breakdown.
const MOVEMENT_SOURCE = { deposit: "deposit", use: "manual_use", adjust_in: "adjust", adjust_out: "adjust", reversal: "reversal" };

const schemas = new WeakMap();
async function ensure(pool) {
  if (!schemas.has(pool)) schemas.set(pool, (async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query("SELECT pg_advisory_xact_lock(hashtext('gamedb-inv-ledger-schema'))");
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_inv_accounts (
        id BIGSERIAL PRIMARY KEY, account_key TEXT UNIQUE NOT NULL, provider TEXT NOT NULL,
        label TEXT NOT NULL, currency TEXT NOT NULL,
        cost_method TEXT NOT NULL DEFAULT 'reference' CHECK(cost_method IN ('reference','deposit_average')),
        reference_rate_thb NUMERIC(16,8) CHECK(reference_rate_thb > 0),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
        created_by INTEGER NOT NULL, created_by_label TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_inv_entries (
        id BIGSERIAL PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES gamedb_inv_accounts(id),
        request_id UUID UNIQUE NOT NULL, request_hash TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('deposit','use','adjust_in','adjust_out','reversal')),
        direction SMALLINT NOT NULL CHECK(direction IN (-1,1)),
        amount NUMERIC(20,4) NOT NULL CHECK(amount > 0),
        order_ref TEXT, thb_amount NUMERIC(14,2) CHECK(thb_amount >= 0), sale_thb NUMERIC(14,2) CHECK(sale_thb >= 0),
        reverses_entry_id BIGINT UNIQUE REFERENCES gamedb_inv_entries(id),
        note TEXT NOT NULL, actor_id INTEGER NOT NULL, actor_label TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK((kind = 'reversal') = (reverses_entry_id IS NOT NULL)),
        CHECK(kind <> 'use' OR order_ref IS NOT NULL))`);
      await c.query("CREATE INDEX IF NOT EXISTS gamedb_inv_entries_account_time ON gamedb_inv_entries(account_id, occurred_at, id)");
      await c.query("CREATE INDEX IF NOT EXISTS gamedb_inv_entries_order ON gamedb_inv_entries(order_ref) WHERE order_ref IS NOT NULL");
      // Added for the debit page: the account's workbook/group, and the receipt number of a debit.
      await c.query("ALTER TABLE gamedb_inv_accounts ADD COLUMN IF NOT EXISTS category TEXT");
      await c.query("ALTER TABLE gamedb_inv_entries ADD COLUMN IF NOT EXISTS invoice TEXT");
      await c.query("CREATE INDEX IF NOT EXISTS gamedb_inv_entries_recorded ON gamedb_inv_entries(recorded_at, id)");
      // Added for the order pages: which order list a use came from (web / russia / kaleoz ...),
      // since order numbers of different marketplaces can be the same.
      await c.query("ALTER TABLE gamedb_inv_entries ADD COLUMN IF NOT EXISTS order_source TEXT");
      // Who is using an account now: one holder at a time, released by them or an admin.
      // Not history (the entries are): a released reservation is simply deleted.
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_inv_reservations (
        account_id BIGINT PRIMARY KEY REFERENCES gamedb_inv_accounts(id),
        user_id INTEGER NOT NULL, user_label TEXT NOT NULL, reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query("CREATE INDEX IF NOT EXISTS gamedb_inv_reservations_user ON gamedb_inv_reservations(user_id)");
      await c.query(`CREATE TABLE IF NOT EXISTS gamedb_inv_snapshots (
        id BIGSERIAL PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES gamedb_inv_accounts(id),
        request_id UUID UNIQUE, source TEXT NOT NULL CHECK(source IN ('api','manual')),
        balance NUMERIC(20,4) NOT NULL CHECK(balance >= 0), observed_at TIMESTAMPTZ NOT NULL,
        actor_id INTEGER, actor_label TEXT NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(account_id, source, observed_at))`);
      // History is evidence: corrections are new rows (reversal, adjust, a new snapshot).
      await c.query(`CREATE OR REPLACE FUNCTION gamedb_inv_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME; END $$`);
      for (const table of ["gamedb_inv_entries", "gamedb_inv_snapshots"]) {
        const exists = await c.query("SELECT 1 FROM pg_trigger WHERE tgname=$1", [`${table}_append_only`]);
        if (!exists.rows.length) {
          await c.query(`CREATE TRIGGER ${table}_append_only BEFORE UPDATE OR DELETE ON ${table}
            FOR EACH ROW EXECUTE FUNCTION gamedb_inv_append_only()`);
          await c.query(`CREATE TRIGGER ${table}_no_truncate BEFORE TRUNCATE ON ${table}
            FOR EACH STATEMENT EXECUTE FUNCTION gamedb_inv_append_only()`);
        }
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  })().catch(e => { schemas.delete(pool); throw e; }));
  await schemas.get(pool);
}

const actorLabel = actor => actor.displayName || actor.username || `User #${actor.id}`;
const hashOf = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const iso = value => (value instanceof Date ? value : new Date(value)).toISOString();

async function inTransaction(pool, work) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout='5s'");
    const result = await work(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { c.release(); }
}

/** Highest balance the account can have now: latest snapshot plus ledger movements after it. */
async function upperBoundBalance(c, accountId) {
  const snap = (await c.query(`SELECT balance::text, observed_at FROM gamedb_inv_snapshots
    WHERE account_id=$1 ORDER BY observed_at DESC, id DESC LIMIT 1`, [accountId])).rows[0];
  if (!snap) return null; // no anchor yet: nothing to check against
  const { rows } = await c.query(`SELECT COALESCE(SUM(direction * amount), 0)::text AS moved
    FROM gamedb_inv_entries WHERE account_id=$1 AND occurred_at > $2`, [accountId, snap.observed_at]);
  const moved = rows[0].moved;
  const signed = moved.startsWith("-") ? -toUnits(moved.slice(1), { allowZero: true }) : toUnits(moved, { allowZero: true });
  return toUnits(snap.balance, { allowZero: true }) + signed;
}

export function createInventoryLedger(pool, { now = () => new Date() } = {}) {
  const requireView = actor => { if (!canViewUsdInventory(actor)) throw ledgerError("ไม่มีสิทธิ์ดูบัญชีคลัง", 403); };
  const requireManage = actor => { if (!canManageUsdInventory(actor)) throw ledgerError("เฉพาะ Projectm Admin จึงบันทึกบัญชีคลังได้", 403); };
  // The debit page is open to every signed-in staff account (decided 2026-10-29); roles come later.
  const requireSignedIn = actor => { if (actor?.id == null) throw ledgerError("กรุณาเข้าสู่ระบบ", 401); };
  const bangkokDay = value => new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10);

  async function registerAccounts(list, actor) {
    requireManage(actor);
    if (!Array.isArray(list) || !list.length || list.length > 500) throw ledgerError("ส่งรายการบัญชี 1–500 รายการ");
    const inputs = list.map(accountInput);
    await ensure(pool);
    return inTransaction(pool, async c => {
      const result = [];
      for (const a of inputs) {
        const inserted = (await c.query(`INSERT INTO gamedb_inv_accounts
          (account_key, provider, label, currency, cost_method, reference_rate_thb, created_by, created_by_label, category, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (account_key) DO NOTHING RETURNING id::text`,
        [a.key, a.provider, a.label, a.currency, a.costMethod, a.referenceRateThb, actor.id, actorLabel(actor), a.category, a.status])).rows[0];
        if (inserted) { result.push({ id: inserted.id, key: a.key, created: true }); continue; }
        const existing = (await c.query("SELECT id::text, currency FROM gamedb_inv_accounts WHERE account_key=$1", [a.key])).rows[0];
        // Same key in another currency means two different things share a name.
        if (existing.currency !== a.currency) throw ledgerError(`บัญชี ${a.key} มีอยู่แล้วในสกุล ${existing.currency}`, 409);
        if (a.category) await c.query("UPDATE gamedb_inv_accounts SET category=$2 WHERE id=$1 AND category IS DISTINCT FROM $2", [existing.id, a.category]);
        result.push({ id: existing.id, key: a.key, created: false });
      }
      return result;
    });
  }

  /**
   * `staff`: the debit page path. Any signed-in account may record a "use", and may
   * reverse only its own "use" on the same Bangkok day. Everything else needs projectm.admin.
   * `historical`: an admin import of an old sheet. No backdate limit and no balance bound
   * (the bound is today's balance, which says nothing about a months-old row).
   */
  // `holder`: the order pages. A use is only accepted from the person who holds the account's
  // reservation, checked under the same lock as the insert.
  async function recordEntry(body, actor, { staff = false, historical = false, holder = false } = {}) {
    if (staff && !historical) requireSignedIn(actor); else requireManage(actor);
    const input = entryInput(body);
    if (staff && input.kind !== "use" && input.kind !== "reversal") throw ledgerError("บันทึกได้เฉพาะยอดที่ใช้", 403);
    const hash = hashOf(input);
    const at = input.occurredAt ? new Date(input.occurredAt) : now();
    const current = now().getTime();
    if (at.getTime() > current + CLOCK_SKEW_MS) throw ledgerError("เวลาที่ทำรายการต้องไม่อยู่ในอนาคต");
    if (!historical && at.getTime() < current - BACKDATE_DAYS * 86400000) throw ledgerError(`บันทึกย้อนหลังได้ไม่เกิน ${BACKDATE_DAYS} วัน`);
    await ensure(pool);
    try {
      return await inTransaction(pool, async c => {
        // Serialises retries of one request even when they name different accounts.
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`inv-request:${input.requestId}`]);
        const previous = (await c.query("SELECT id::text, request_hash, actor_id FROM gamedb_inv_entries WHERE request_id=$1", [input.requestId])).rows[0];
        if (previous) {
          if (previous.request_hash !== hash || String(previous.actor_id) !== String(actor.id)) throw ledgerError("รหัสคำขอนี้ถูกใช้กับรายการอื่นแล้ว", 409);
          return { id: previous.id, replayed: true };
        }

        let row;
        if (input.kind === "reversal") {
          const target = (await c.query(`SELECT e.id, e.account_id, e.kind, e.direction, e.amount::text, e.order_ref,
              e.order_source, e.actor_id, e.recorded_at
            FROM gamedb_inv_entries e WHERE e.id=$1`, [input.reversesEntryId])).rows[0];
          if (!target) throw ledgerError("ไม่พบรายการที่ต้องการกลับรายการ", 404);
          if (target.kind === "reversal") throw ledgerError("กลับรายการซ้อนไม่ได้ ให้บันทึกรายการใหม่แทน", 409);
          if (staff && !canManageUsdInventory(actor) && (target.kind !== "use" || String(target.actor_id) !== String(actor.id)
            || bangkokDay(target.recorded_at) !== bangkokDay(now()))) {
            throw ledgerError("ยกเลิกได้เฉพาะรายการของตัวเองที่บันทึกวันนี้ ถ้าเป็นรายการอื่นให้แจ้ง Admin", 403);
          }
          await c.query("SELECT id FROM gamedb_inv_accounts WHERE id=$1 FOR UPDATE", [target.account_id]);
          const done = await c.query("SELECT 1 FROM gamedb_inv_entries WHERE reverses_entry_id=$1", [target.id]);
          if (done.rows.length) throw ledgerError("รายการนี้ถูกกลับรายการไปแล้ว", 409);
          row = { accountId: target.account_id, direction: -Number(target.direction), amount: target.amount, orderRef: target.order_ref,
            orderSource: target.order_source, thb: null, sale: null, invoice: null };
        } else {
          const account = (await c.query("SELECT id, status FROM gamedb_inv_accounts WHERE id=$1 FOR UPDATE", [input.accountId])).rows[0];
          if (!account) throw ledgerError("ไม่พบบัญชี", 404);
          // A closed account still has its old history; only new movements are refused.
          if (account.status !== "active" && !historical) throw ledgerError("บัญชีนี้ปิดใช้งานแล้ว", 409);
          if (holder) {
            const held = (await c.query("SELECT user_id FROM gamedb_inv_reservations WHERE account_id=$1 FOR UPDATE", [account.id])).rows[0];
            if (!held || String(held.user_id) !== String(actor.id)) throw ledgerError("บัญชีนี้ไม่ได้จองไว้กับคุณแล้ว กรุณาจองใหม่ในหน้าจองช่องทาง", 409);
          }
          const direction = LEDGER_DIRECTION[input.kind];
          if (direction < 0 && !historical) {
            // Bots only ever lower the balance, so this bound is safe: spending past it
            // means a deposit or a newer snapshot is missing.
            const bound = await upperBoundBalance(c, account.id);
            if (bound != null && toUnits(input.amount) > bound) {
              throw ledgerError(`ยอดคงเหลือไม่พอ (สูงสุด ${fromUnits(bound)}) กรุณาบันทึกยอดเติมเข้าหรือยอดคงเหลือล่าสุดก่อน`, 409);
            }
          }
          row = { accountId: account.id, direction, amount: input.amount, orderRef: input.orderRef, orderSource: input.orderSource ?? null,
            thb: input.thbAmount, sale: input.saleThb, invoice: input.invoice };
        }
        const { rows } = await c.query(`INSERT INTO gamedb_inv_entries
          (account_id, request_id, request_hash, kind, direction, amount, order_ref, thb_amount, sale_thb,
           reverses_entry_id, note, actor_id, actor_label, occurred_at, invoice, recorded_at, order_source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id::text`,
        // recorded_at from the same clock as the same-day cancel rule, not the database's NOW().
        [row.accountId, input.requestId, hash, input.kind, row.direction, row.amount, row.orderRef, row.thb, row.sale,
          input.reversesEntryId ?? null, input.note, actor.id, actorLabel(actor), iso(at), row.invoice ?? null, iso(now()), row.orderSource ?? null]);
        return { id: rows[0].id, replayed: false };
      });
    } catch (e) {
      if (e.code === "23505" && String(e.constraint ?? e.detail ?? e.message).includes("reverses_entry_id")) {
        throw ledgerError("รายการนี้ถูกกลับรายการไปแล้ว", 409);
      }
      throw e;
    }
  }

  async function insertSnapshot(input, actor) {
    if (new Date(input.observedAt).getTime() > now().getTime() + CLOCK_SKEW_MS) throw ledgerError("เวลาของยอดคงเหลือต้องไม่อยู่ในอนาคต");
    await ensure(pool);
    return inTransaction(pool, async c => {
      if (input.requestId) {
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`inv-snapshot:${input.requestId}`]);
        const previous = (await c.query("SELECT id::text, account_id::text, balance::text, observed_at FROM gamedb_inv_snapshots WHERE request_id=$1", [input.requestId])).rows[0];
        if (previous) {
          const same = previous.account_id === input.accountId && previous.balance === input.balance && iso(previous.observed_at) === input.observedAt;
          if (!same) throw ledgerError("รหัสคำขอนี้ถูกใช้กับยอดอื่นแล้ว", 409);
          return { id: previous.id, replayed: true };
        }
      }
      const account = (await c.query("SELECT id FROM gamedb_inv_accounts WHERE id=$1", [input.accountId])).rows[0];
      if (!account) throw ledgerError("ไม่พบบัญชี", 404);
      const inserted = (await c.query(`INSERT INTO gamedb_inv_snapshots
        (account_id, request_id, source, balance, observed_at, actor_id, actor_label)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (account_id, source, observed_at) DO NOTHING RETURNING id::text`,
      [input.accountId, input.requestId, input.source, input.balance, input.observedAt, actor?.id ?? null, actor ? actorLabel(actor) : "provider-sync"])).rows[0];
      if (inserted) return { id: inserted.id, replayed: false };
      const existing = (await c.query(`SELECT id::text, balance::text FROM gamedb_inv_snapshots
        WHERE account_id=$1 AND source=$2 AND observed_at=$3`, [input.accountId, input.source, input.observedAt])).rows[0];
      if (existing.balance !== input.balance) throw ledgerError("มียอดคงเหลืออื่นในเวลาเดียวกันแล้ว", 409);
      return { id: existing.id, replayed: true };
    });
  }

  const entryColumns = `e.id::text, e.account_id::text AS "accountId", a.label AS "accountLabel", a.currency, a.category,
    e.kind, e.direction, e.amount::text AS amount, e.order_ref AS "orderRef", e.invoice, e.note,
    e.actor_id AS "actorId", e.actor_label AS "recordedBy", e.occurred_at AS "occurredAt", e.recorded_at AS "recordedAt",
    e.reverses_entry_id::text AS "reversesEntryId",
    (SELECT r.id::text FROM gamedb_inv_entries r WHERE r.reverses_entry_id = e.id) AS "reversedBy"`;

  return {
    registerAccounts,
    recordEntry,

    /**
     * The debit page: many "use" rows for one account. Rows are independent: a bad
     * row is reported back and the others are still recorded (each is idempotent).
     */
    async recordDebits(body, actor) {
      requireSignedIn(actor);
      const batch = debitBatchInput(body);
      const results = [];
      for (const [index, row] of batch.rows.entries()) {
        try {
          results.push({ index, ok: true, ...(await recordEntry(row, actor, { staff: true })) });
        } catch (e) {
          if (!e.status || e.status >= 500) throw e;
          results.push({ index, ok: false, status: e.status, error: e.message });
        }
      }
      return { accountId: batch.accountId, saved: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
    },

    /**
     * Admin import of old sheet rows (deposits and uses), oldest first. Like recordDebits,
     * a bad row is reported back and the rest are still recorded; each row is idempotent.
     */
    async importEntries(rows, actor) {
      requireManage(actor);
      if (!Array.isArray(rows) || !rows.length || rows.length > LEDGER_MAX_BATCH) throw ledgerError(`นำเข้าได้ครั้งละ 1–${LEDGER_MAX_BATCH} รายการ`);
      const results = [];
      for (const [index, row] of rows.entries()) {
        try {
          results.push({ index, ok: true, ...(await recordEntry(row, actor, { historical: true })) });
        } catch (e) {
          if (!e.status || e.status >= 500) throw e;
          results.push({ index, ok: false, status: e.status, error: e.message });
        }
      }
      return results;
    },

    /** Undo a debit with a reversal row (history is never edited). */
    async reverseEntry(body, actor) {
      requireSignedIn(actor);
      return recordEntry({ ...body, kind: "reversal", note: String(body?.note ?? "").trim() || "ยกเลิกการยกยอด" }, actor, { staff: true });
    },

    /** Accounts staff can debit, with their group. */
    async debitAccounts(actor) {
      requireSignedIn(actor);
      await ensure(pool);
      const { rows } = await pool.query(`SELECT a.id::text, a.label, a.currency, a.category, a.provider, a.status
        FROM gamedb_inv_accounts a ORDER BY a.category NULLS LAST, a.label, a.id`);
      return rows;
    },

    /** Every account with whoever holds it now (the reservation page). iTunes keeps its own mail reservations. */
    async reservations(actor) {
      requireSignedIn(actor);
      await ensure(pool);
      const { rows } = await pool.query(`SELECT a.id::text, a.label, a.currency, a.category, a.provider, a.status,
          r.user_id AS "holderId", r.user_label AS "holder", r.reserved_at AS "reservedAt"
        FROM gamedb_inv_accounts a LEFT JOIN gamedb_inv_reservations r ON r.account_id = a.id
        WHERE a.provider <> 'itunes' ORDER BY a.category NULLS LAST, a.label, a.id`);
      return rows.map(r => ({ ...r, holderId: r.holderId == null ? null : String(r.holderId), reservedAt: r.reservedAt ? iso(r.reservedAt) : null,
        mine: r.holderId != null && String(r.holderId) === String(actor.id) }));
    },

    /** Take an active, non-iTunes account. Held by someone else: refused with their name. */
    async reserve(accountId, actor) {
      requireSignedIn(actor);
      if (!/^\d{1,18}$/.test(String(accountId ?? ""))) throw ledgerError("ระบุบัญชีให้ถูกต้อง");
      await ensure(pool);
      return inTransaction(pool, async c => {
        const account = (await c.query("SELECT id, provider, status FROM gamedb_inv_accounts WHERE id=$1 FOR UPDATE", [accountId])).rows[0];
        if (!account) throw ledgerError("ไม่พบบัญชี", 404);
        if (account.provider === "itunes") throw ledgerError("เมล iTunes ใช้การจองในหน้า iTune", 409);
        if (account.status !== "active") throw ledgerError("บัญชีนี้ปิดใช้งานแล้ว", 409);
        const held = (await c.query("SELECT user_id, user_label FROM gamedb_inv_reservations WHERE account_id=$1", [accountId])).rows[0];
        if (held && String(held.user_id) !== String(actor.id)) throw ledgerError(`จองโดย ${held.user_label} แล้ว`, 409);
        if (!held) await c.query("INSERT INTO gamedb_inv_reservations (account_id, user_id, user_label) VALUES ($1,$2,$3)", [accountId, actor.id, actorLabel(actor)]);
        return { accountId: String(accountId), reserved: true };
      });
    },

    /** Give an account back: its holder, or an admin for anyone's. */
    async release(accountId, actor) {
      requireSignedIn(actor);
      if (!/^\d{1,18}$/.test(String(accountId ?? ""))) throw ledgerError("ระบุบัญชีให้ถูกต้อง");
      await ensure(pool);
      const { rowCount } = await pool.query("DELETE FROM gamedb_inv_reservations WHERE account_id=$1 AND (user_id=$2 OR $3)",
        [accountId, actor.id, canManageUsdInventory(actor)]);
      if (!rowCount) throw ledgerError("คืนได้เฉพาะบัญชีที่ตัวเองจองไว้", 409);
      return { accountId: String(accountId), reserved: false };
    },

    /** The accounts one person holds, for the order pages' dropdown. */
    async heldAccounts(actor) {
      requireSignedIn(actor);
      await ensure(pool);
      const { rows } = await pool.query(`SELECT a.id::text, a.label, a.currency, a.category, r.reserved_at AS "reservedAt"
        FROM gamedb_inv_reservations r JOIN gamedb_inv_accounts a ON a.id = r.account_id
        WHERE r.user_id=$1 AND a.status='active' ORDER BY a.category NULLS LAST, a.label`, [actor.id]);
      return rows.map(r => ({ ...r, reservedAt: iso(r.reservedAt) }));
    },

    /**
     * What was used for one order: every use, cancelled ones marked, from anyone (others see it too).
     * Matched on order number and source, since marketplaces' numbers can repeat across sources.
     */
    async orderUsage(actor, { orderRef, orderSource }) {
      requireSignedIn(actor);
      const ref = String(orderRef ?? "").trim().slice(0, 120), source = orderSourceInput(orderSource);
      if (!ref) throw ledgerError("ระบุเลขออเดอร์");
      await ensure(pool);
      const { rows } = await pool.query(`SELECT ${entryColumns} FROM gamedb_inv_entries e JOIN gamedb_inv_accounts a ON a.id = e.account_id
        WHERE e.kind='use' AND e.order_ref=$1 AND e.order_source=$2 ORDER BY e.recorded_at, e.id LIMIT 200`, [ref, source]);
      const today = bangkokDay(now()), admin = canManageUsdInventory(actor);
      return rows.map(e => ({ ...e, occurredAt: iso(e.occurredAt), recordedAt: iso(e.recordedAt), cancelled: Boolean(e.reversedBy),
        canReverse: !e.reversedBy && (admin || (String(e.actorId) === String(actor.id) && bangkokDay(e.recordedAt) === today)) }));
    },

    /** Debits in a window, newest first; optionally one account or one person. */
    async listEntries(actor, { accountId = "", from, to, mine = false, limit = 500 } = {}) {
      requireSignedIn(actor);
      const start = new Date(from ?? NaN), end = new Date(to ?? NaN);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw ledgerError("ช่วงเวลาไม่ถูกต้อง");
      if (accountId && !/^\d{1,18}$/.test(String(accountId))) throw ledgerError("ระบุบัญชีให้ถูกต้อง");
      const cap = Math.min(Math.max(Number(limit) || 500, 1), 2000);
      await ensure(pool);
      const { rows } = await pool.query(`SELECT ${entryColumns}
        FROM gamedb_inv_entries e JOIN gamedb_inv_accounts a ON a.id = e.account_id
        WHERE e.recorded_at >= $1 AND e.recorded_at < $2 AND ($3 = '' OR e.account_id = NULLIF($3, '')::bigint)
          AND ($4 = FALSE OR e.actor_id = $5)
        ORDER BY e.recorded_at DESC, e.id DESC LIMIT ${cap + 1}`, [iso(start), iso(end), String(accountId || ""), Boolean(mine), actor.id]);
      const today = bangkokDay(now()), admin = canManageUsdInventory(actor);
      const entries = rows.slice(0, cap).map(e => ({ ...e, occurredAt: iso(e.occurredAt), recordedAt: iso(e.recordedAt),
        canReverse: e.kind === "use" && !e.reversedBy && (admin || (String(e.actorId) === String(actor.id) && bangkokDay(e.recordedAt) === today)) }));
      return { entries, truncated: rows.length > cap };
    },

    /** Net hand use per account in a window (reversed debits cancel out). */
    async debitSummary(actor, { from, to } = {}) {
      requireSignedIn(actor);
      const start = new Date(from ?? NaN), end = new Date(to ?? NaN);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw ledgerError("ช่วงเวลาไม่ถูกต้อง");
      await ensure(pool);
      const { rows } = await pool.query(`SELECT a.id::text AS "accountId", a.label, a.currency, a.category,
          COUNT(*) FILTER (WHERE e.kind = 'use')::int AS uses,
          COUNT(*) FILTER (WHERE e.kind = 'reversal')::int AS reversals,
          COALESCE(-SUM(e.direction * e.amount) FILTER (WHERE e.kind IN ('use','reversal')), 0)::text AS "netUsed",
          MAX(e.recorded_at) AS "lastAt"
        FROM gamedb_inv_entries e JOIN gamedb_inv_accounts a ON a.id = e.account_id
        WHERE e.recorded_at >= $1 AND e.recorded_at < $2 AND e.kind IN ('use','reversal')
        GROUP BY a.id ORDER BY a.category NULLS LAST, a.label`, [iso(start), iso(end)]);
      return rows.map(r => ({ ...r, lastAt: r.lastAt ? iso(r.lastAt) : null }));
    },

    /** A person reads the balance off a provider page and types it in. */
    async recordSnapshot(body, actor) {
      requireManage(actor);
      const input = snapshotInput({ ...body, source: "manual" });
      if (!input.requestId) throw ledgerError("รหัสคำขอไม่ถูกต้อง");
      return insertSnapshot(input, actor);
    },

    /** Trusted server-side sync that read a provider's balance API. Not reachable from a request. */
    async recordProviderSnapshot(body) {
      return insertSnapshot(snapshotInput({ ...body, source: "api", requestId: null }), null);
    },

    /** Which of these order refs already have a hand "use" that was not reversed. */
    async recordedOrderRefs(actor, refs) {
      requireView(actor);
      const list = [...new Set((refs ?? []).map(r => String(r ?? "").slice(0, 120)).filter(Boolean))];
      if (!list.length) return new Set();
      if (list.length > MAX_ROWS) throw ledgerError("รายการเกิน 20,000 รายการ กรุณาลดช่วงเวลา", 413);
      await ensure(pool);
      const { rows } = await pool.query(`SELECT DISTINCT e.order_ref FROM gamedb_inv_entries e
        WHERE e.kind='use' AND e.order_ref = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM gamedb_inv_entries r WHERE r.reverses_entry_id = e.id)`, [list]);
      return new Set(rows.map(r => r.order_ref));
    },

    /** Same check for the debit page (any signed-in account). */
    async debitedOrderRefs(actor, refs) {
      requireSignedIn(actor);
      const list = [...new Set((refs ?? []).map(r => String(r ?? "").trim().slice(0, 120)).filter(Boolean))];
      if (!list.length) return new Set();
      await ensure(pool);
      const { rows } = await pool.query(`SELECT DISTINCT e.order_ref FROM gamedb_inv_entries e
        WHERE e.kind='use' AND e.order_ref = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM gamedb_inv_entries r WHERE r.reverses_entry_id = e.id)`, [list.slice(0, 2000)]);
      return new Set(rows.map(r => r.order_ref));
    },

    async listAccounts(actor) {
      requireView(actor);
      await ensure(pool);
      const { rows } = await pool.query(`SELECT a.id::text, a.account_key AS key, a.provider, a.label, a.currency,
          a.cost_method AS "costMethod", a.reference_rate_thb::text AS "referenceRateThb", a.status,
          s.balance::text AS "snapshotBalance", s.observed_at AS "snapshotAt", s.source AS "snapshotSource",
          (SELECT COALESCE(SUM(e.direction * e.amount), 0)::text FROM gamedb_inv_entries e
            WHERE e.account_id = a.id AND (s.observed_at IS NULL OR e.occurred_at > s.observed_at)) AS "movedSinceSnapshot"
        FROM gamedb_inv_accounts a
        LEFT JOIN LATERAL (SELECT balance, observed_at, source FROM gamedb_inv_snapshots
          WHERE account_id = a.id ORDER BY observed_at DESC, id DESC LIMIT 1) s ON TRUE
        ORDER BY a.provider, a.label, a.id`);
      return rows;
    },

    /**
     * Explain balance changes between snapshots. `botMovements` come from the
     * bot database for this account: [{ occurredAt, amount, ref, direction? }]
     * (direction -1 = spent, the default; +1 = refunded to the account).
     * `externalSnapshots` are balances read elsewhere (e.g. before/after each
     * bot receipt) and are used, not stored: [{ balance, observedAt, tag? }].
     * The account is a ledger id, or { key } -- an unregistered key reconciles
     * on the outside evidence alone and says so (`registered: false`).
     */
    async reconcileAccount(actor, account, { from, to, botMovements = [], externalSnapshots = [], tolerance = "0" } = {}) {
      requireView(actor);
      const start = new Date(from ?? NaN), end = new Date(to ?? NaN);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw ledgerError("ช่วงเวลาไม่ถูกต้อง");
      if (botMovements.length > MAX_ROWS || externalSnapshots.length > 2 * MAX_ROWS) throw ledgerError("รายการเกิน 20,000 รายการ กรุณาลดช่วงเวลา", 413);
      await ensure(pool);
      let accountId;
      if (account && typeof account === "object") {
        accountId = (await pool.query("SELECT id::text FROM gamedb_inv_accounts WHERE account_key=$1", [String(account.key ?? "")])).rows[0]?.id ?? null;
      } else {
        if (!/^\d{1,18}$/.test(String(account ?? ""))) throw ledgerError("ระบุบัญชีให้ถูกต้อง");
        accountId = String(account);
      }
      let stored = [], entries = [];
      if (accountId) {
        // Anchor on the latest stored snapshot at or before the window, so day one is checked too.
        const anchor = (await pool.query(`SELECT observed_at FROM gamedb_inv_snapshots WHERE account_id=$1 AND observed_at <= $2
          ORDER BY observed_at DESC LIMIT 1`, [accountId, iso(start)])).rows[0]?.observed_at ?? start;
        stored = (await pool.query(`SELECT balance::text AS balance, observed_at AS "observedAt", source FROM gamedb_inv_snapshots
          WHERE account_id=$1 AND observed_at >= $2 AND observed_at <= $3 ORDER BY observed_at, id`, [accountId, iso(anchor), iso(end)])).rows
          .map(s => ({ ...s, observedAt: iso(s.observedAt), tag: s.source === "api" ? "ยอดจากระบบ" : "ยอดที่บันทึก" }));
        entries = (await pool.query(`SELECT kind, direction, amount::text AS amount, order_ref AS "ref", occurred_at AS "occurredAt"
          FROM gamedb_inv_entries WHERE account_id=$1 AND occurred_at > $2 AND occurred_at <= $3
          ORDER BY occurred_at, id LIMIT ${MAX_ROWS + 1}`, [accountId, iso(anchor), iso(end)])).rows;
        if (entries.length > MAX_ROWS) throw ledgerError("รายการเกิน 20,000 รายการ กรุณาลดช่วงเวลา", 413);
      }
      const movements = [
        ...entries.map(e => ({ source: MOVEMENT_SOURCE[e.kind], occurredAt: iso(e.occurredAt), ref: e.ref,
          effect: BigInt(e.direction) * toUnits(e.amount) })),
        ...botMovements.map(m => ({ source: "bot", occurredAt: iso(m.occurredAt), ref: m.ref ?? null, unknown: Boolean(m.unknown),
          effect: m.unknown ? 0n : (Number(m.direction ?? -1) > 0 ? 1n : -1n) * toUnits(m.amount) })),
      ];
      const outside = externalSnapshots.map(s => ({ balance: s.balance, observedAt: iso(s.observedAt), source: "external", tag: s.tag ?? null }));
      return { accountId, registered: Boolean(accountId), ...reconcile({ snapshots: [...stored, ...outside], movements, tolerance }) };
    },

    /** Cost and profit of every manual "use" in a window, with how each cost was decided. */
    async orderCosts(actor, { from, to } = {}) {
      requireView(actor);
      const start = new Date(from ?? NaN), end = new Date(to ?? NaN);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw ledgerError("ช่วงเวลาไม่ถูกต้อง");
      await ensure(pool);
      // Deposits before the window feed the running average, so read from the start of history.
      const { rows } = await pool.query(`SELECT e.id::text, e.account_id::text AS "accountId", e.kind, e.amount::text AS amount,
          e.order_ref AS "orderRef", e.thb_amount::text AS "thbAmount", e.sale_thb::text AS "saleThb", e.occurred_at AS "occurredAt",
          e.reverses_entry_id::text AS "reversesEntryId", e.actor_label AS "recordedBy",
          a.label AS "accountLabel", a.currency, a.cost_method AS "costMethod", a.reference_rate_thb::text AS "referenceRateThb"
        FROM gamedb_inv_entries e JOIN gamedb_inv_accounts a ON a.id = e.account_id
        WHERE e.occurred_at <= $1 AND (e.kind IN ('deposit','reversal') OR e.occurred_at >= $2)
        ORDER BY e.occurred_at, e.id LIMIT ${MAX_ROWS + 1}`, [iso(end), iso(start)]);
      if (rows.length > MAX_ROWS) throw ledgerError("รายการเกิน 20,000 รายการ กรุณาลดช่วงเวลา", 413);
      const reversed = new Set(rows.filter(r => r.kind === "reversal").map(r => r.reversesEntryId));
      const totals = new Map(); // accountId -> priced deposits so far
      const orders = [];
      for (const r of rows) {
        if (r.kind === "deposit" && r.thbAmount != null && !reversed.has(r.id)) {
          const t = totals.get(r.accountId) ?? { amount: 0n, thb: 0n };
          t.amount += toUnits(r.amount); t.thb += toUnits(r.thbAmount, { allowZero: true });
          totals.set(r.accountId, t);
        }
        if (r.kind !== "use" || new Date(r.occurredAt) < start) continue;
        const t = totals.get(r.accountId);
        const cost = costOfUse(r, r, t ? { amount: fromUnits(t.amount), thb: fromUnits(t.thb) } : null);
        orders.push({
          id: r.id, orderRef: r.orderRef, accountId: r.accountId, accountLabel: r.accountLabel, currency: r.currency,
          amount: r.amount, occurredAt: iso(r.occurredAt), recordedBy: r.recordedBy, reversed: reversed.has(r.id),
          costThb: cost.thb, costBasis: cost.basis, saleThb: r.saleThb, profitThb: profitThb(r.saleThb, cost.thb),
        });
      }
      return orders;
    },
  };
}

let repo;
export const inventoryLedger = () => repo ||= createInventoryLedger(getPool());
