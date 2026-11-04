import { getPool } from "@/lib/db";
import {
  DEFAULT_WALLETS,
  fromWalletUnits,
  toWalletUnits,
  reviewWalletAdjust,
  validateWalletEntry,
  walletKey,
  WALLET_COUNTED,
  WALLET_ENTRY_STATUSES,
  WALLET_ENTRY_KINDS,
  WALLET_PAYMENT_STATUSES,
} from "@/lib/stock-wallets";

// Wallets (src/lib/stock-wallets.js): each entry is one row with one or two
// legs; a balance is SUM(legs.amount). Each leg also keeps the balance it
// left, so the history reads like the sheet's "ยอดคงเหลือ" column. A correction
// awaiting approval (or rejected) is kept but left out of every balance.
let schemaReady;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function ensureWalletSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_wallets (
          id          SERIAL PRIMARY KEY,
          code        VARCHAR(32) NOT NULL UNIQUE,
          name        VARCHAR(120) NOT NULL,
          currencies  TEXT[] NOT NULL DEFAULT '{}',
          role        TEXT NOT NULL DEFAULT '',
          sort_order  INTEGER NOT NULL DEFAULT 0,
          status      VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_wallet_entries (
          id          BIGSERIAL PRIMARY KEY,
          kind        VARCHAR(16) NOT NULL CHECK (kind IN (${WALLET_ENTRY_KINDS.map((kind) => `'${kind}'`).join(", ")})),
          title       VARCHAR(200) NOT NULL DEFAULT '',
          note        TEXT NOT NULL DEFAULT '',
          txid        VARCHAR(200) NOT NULL DEFAULT '',
          status      VARCHAR(20) NOT NULL DEFAULT 'done',
          order_id    INTEGER,
          occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          actor_id    INTEGER,
          actor_name  VARCHAR(255) NOT NULL DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Corrections gained an approval step: a wider status list and who reviewed it.
      await client.query(`ALTER TABLE stock_wallet_entries ALTER COLUMN status TYPE VARCHAR(20)`);
      await client.query(`ALTER TABLE stock_wallet_entries DROP CONSTRAINT IF EXISTS stock_wallet_entries_status_check`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD CONSTRAINT stock_wallet_entries_status_check
                             CHECK (status IN (${WALLET_ENTRY_STATUSES.map((status) => `'${status}'`).join(", ")}))`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS reviewed_by_id INTEGER`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT ''`);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_wallet_entries_time_idx ON stock_wallet_entries (occurred_at DESC, id DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_wallet_entries_order_idx ON stock_wallet_entries (order_id) WHERE order_id IS NOT NULL`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_wallet_legs (
          id            BIGSERIAL PRIMARY KEY,
          entry_id      BIGINT NOT NULL REFERENCES stock_wallet_entries(id) ON DELETE CASCADE,
          wallet_id     INTEGER NOT NULL REFERENCES stock_wallets(id) ON DELETE RESTRICT,
          currency      VARCHAR(5) NOT NULL,
          amount        NUMERIC(30, 8) NOT NULL CHECK (amount <> 0),
          fee           NUMERIC(30, 8) NOT NULL DEFAULT 0 CHECK (fee >= 0),
          balance_after NUMERIC(30, 8) NOT NULL
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_wallet_legs_wallet_idx ON stock_wallet_legs (wallet_id, currency)`);
      for (const wallet of DEFAULT_WALLETS) {
        await client.query(
          `INSERT INTO stock_wallets (code, name, currencies, role, sort_order) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (code) DO NOTHING`,
          [wallet.code, wallet.name, wallet.currencies, wallet.role, wallet.sortOrder]
        );
      }
    } finally {
      client.release();
    }
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

const mapWallet = (row) => ({ id: row.id, code: row.code, name: row.name, currencies: row.currencies, role: row.role, status: row.status });

async function balancesFor(client, walletIds) {
  const result = await client.query(
    `SELECT l.wallet_id, l.currency, SUM(l.amount)::text AS balance, SUM(l.fee)::text AS fees
       FROM stock_wallet_legs l JOIN stock_wallet_entries e ON e.id = l.entry_id
      WHERE l.wallet_id = ANY($1::int[]) AND ${WALLET_COUNTED}
      GROUP BY l.wallet_id, l.currency`,
    [walletIds]
  );
  return Object.fromEntries(result.rows.map((row) => [walletKey(row.wallet_id, row.currency), { balance: row.balance, fees: row.fees }]));
}

/** Every wallet with its balance and fees paid per currency. */
export async function listWallets() {
  await ensureWalletSchema();
  const pool = getPool();
  const rows = (await pool.query(`SELECT * FROM stock_wallets ORDER BY sort_order, id`)).rows;
  const totals = await balancesFor(pool, rows.map((row) => row.id));
  return rows.map((row) => ({
    ...mapWallet(row),
    balances: row.currencies.map((currency) => {
      const total = totals[walletKey(row.id, currency)];
      return { currency, balance: total ? fromWalletUnits(toWalletUnits(total.balance)) : "0", fees: total ? fromWalletUnits(toWalletUnits(total.fees)) : "0" };
    }),
  }));
}

/** Entries newest first (by receipt time) with their legs; `walletId` narrows to one wallet. */
export async function listWalletEntries({ walletId = null, orderId = null, limit = 300 } = {}) {
  // Joins stock_purchase_orders: callers ensure that table first (ensurePurchaseOrderSchema).
  await ensureWalletSchema();
  const result = await getPool().query(
    `SELECT e.*, o.status AS order_status,
            json_agg(json_build_object('walletId', l.wallet_id, 'walletName', w.name, 'currency', l.currency,
              'amount', l.amount::text, 'fee', l.fee::text, 'balanceAfter', l.balance_after::text) ORDER BY l.id) AS legs
       FROM stock_wallet_entries e
       JOIN stock_wallet_legs l ON l.entry_id = e.id
       JOIN stock_wallets w ON w.id = l.wallet_id
       LEFT JOIN stock_purchase_orders o ON o.id = e.order_id
      WHERE ($1::int IS NULL OR EXISTS (SELECT 1 FROM stock_wallet_legs x WHERE x.entry_id = e.id AND x.wallet_id = $1))
        AND ($2::int IS NULL OR e.order_id = $2)
      GROUP BY e.id, o.status
      ORDER BY e.occurred_at DESC, e.id DESC
      LIMIT $3`,
    [walletId ? Number(walletId) : null, orderId ? Number(orderId) : null, Math.min(Math.max(Number(limit) || 300, 1), 1000)]
  );
  const clean = (value) => fromWalletUnits(toWalletUnits(value));
  return result.rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    title: row.title,
    note: row.note,
    txid: row.txid,
    status: row.status,
    actorId: row.actor_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    orderId: row.order_id,
    orderStatus: row.order_status,
    occurredAt: row.occurred_at,
    actorName: row.actor_name,
    legs: row.legs.map((leg) => ({ ...leg, amount: clean(leg.amount), fee: clean(leg.fee), balanceAfter: clean(leg.balanceAfter) })),
  }));
}

/**
 * Writes one entry inside a transaction the caller opened. The wallets it
 * touches are locked while their balances are read, so two payments cannot
 * both spend the last USDT. `orderId` ties a payment or refund to its order.
 */
export async function insertWalletEntry(client, input, actor = null, { orderId = null } = {}) {
  await ensureWalletSchema();
  const ids = [input.fromWalletId, input.toWalletId].map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const locked = (await client.query(`SELECT * FROM stock_wallets WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [ids])).rows;
  if (locked.some((row) => row.status === "closed")) throw createHttpError("กระเป๋านี้ปิดแล้ว", 400);
  const totals = await balancesFor(client, locked.map((row) => row.id));
  const balances = Object.fromEntries(Object.entries(totals).map(([key, total]) => [key, toWalletUnits(total.balance)]));
  const checked = validateWalletEntry(input, locked.map(mapWallet), balances);
  if (checked.error) throw createHttpError(checked.error, 400);
  const { entry, legs } = checked;

  const created = await client.query(
    `INSERT INTO stock_wallet_entries (kind, title, note, txid, status, order_id, occurred_at, actor_id, actor_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [entry.kind, entry.title, entry.note, entry.txid, entry.status, orderId, entry.occurredAt, actor?.id ?? null, String(actor?.name || "").slice(0, 255)]
  );
  const entryId = Number(created.rows[0].id);
  const counts = entry.status !== "awaiting_approval";
  for (const leg of legs) {
    const key = walletKey(leg.walletId, leg.currency);
    // A correction awaiting approval shows the balance it would leave; approval recomputes it.
    const after = (balances[key] ?? 0n) + leg.amount;
    if (counts) balances[key] = after;
    await client.query(
      `INSERT INTO stock_wallet_legs (entry_id, wallet_id, currency, amount, fee, balance_after) VALUES ($1, $2, $3, $4, $5, $6)`,
      [entryId, leg.walletId, leg.currency, fromWalletUnits(leg.amount), fromWalletUnits(leg.fee), fromWalletUnits(after)]
    );
  }
  return entryId;
}

export async function recordWalletEntry(input, actor = null) {
  await ensureWalletSchema();
  // Payments and refunds of a purchase order are written by that order's steps.
  if (input?.kind === "refund") throw createHttpError("เงินคืนบันทึกจากใบสั่งซื้อ (ขั้น \"ได้เงินคืนแล้ว\")", 400);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const entryId = await insertWalletEntry(client, input, actor);
    await client.query("COMMIT");
    return entryId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** A payment made outside a purchase order: waiting for goods → done. */
export async function setWalletPaymentStatus(entryId, status) {
  await ensureWalletSchema();
  if (!WALLET_PAYMENT_STATUSES.includes(status)) throw createHttpError("สถานะไม่ถูกต้อง", 400);
  const result = await getPool().query(
    `UPDATE stock_wallet_entries SET status = $2 WHERE id = $1 AND kind = 'payment' AND order_id IS NULL RETURNING id`,
    [Number(entryId), status]
  );
  if (!result.rows[0]) throw createHttpError("แก้สถานะได้เฉพาะรายการจ่ายที่ไม่ได้ผูกใบสั่งซื้อ", 400);
  return Number(result.rows[0].id);
}

/** Corrections awaiting approval, oldest first, for the Stock front page. */
export async function listWalletAdjustsAwaiting() {
  const entries = await listWalletEntries({ limit: 1000 });
  return entries.filter((entry) => entry.kind === "adjust" && entry.status === "awaiting_approval").reverse();
}

/**
 * Approves or rejects a correction. Its wallet is locked while the balance is
 * read again, so an approved correction can never take a balance below zero.
 */
export async function reviewWalletEntry(entryId, decision, actor = null, note = "") {
  await ensureWalletSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const entry = (await client.query(`SELECT * FROM stock_wallet_entries WHERE id = $1 FOR UPDATE`, [Number(entryId)])).rows[0];
    if (!entry) throw createHttpError("ไม่พบรายการนี้", 404);
    const step = reviewWalletAdjust({ kind: entry.kind, status: entry.status, actorId: entry.actor_id }, decision, actor, note);
    if (step.error) throw createHttpError(step.error, 400);
    const legs = (await client.query(`SELECT * FROM stock_wallet_legs WHERE entry_id = $1 ORDER BY id`, [entry.id])).rows;
    if (step.status === "done") {
      await client.query(`SELECT id FROM stock_wallets WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [legs.map((leg) => leg.wallet_id)]);
      const totals = await balancesFor(client, legs.map((leg) => leg.wallet_id));
      for (const leg of legs) {
        const now = toWalletUnits(totals[walletKey(leg.wallet_id, leg.currency)]?.balance ?? "0");
        const after = now + toWalletUnits(leg.amount);
        if (after < 0n) throw createHttpError(`ยอด ${leg.currency} ตอนนี้เหลือ ${fromWalletUnits(now)} ปรับลด ${fromWalletUnits(-toWalletUnits(leg.amount))} ไม่ได้`, 400);
        await client.query(`UPDATE stock_wallet_legs SET balance_after = $2 WHERE id = $1`, [leg.id, fromWalletUnits(after)]);
      }
    }
    await client.query(
      `UPDATE stock_wallet_entries SET status = $2, reviewed_by_id = $3, reviewed_by = $4, reviewed_at = NOW(), review_note = $5 WHERE id = $1`,
      [entry.id, step.status, actor?.id ?? null, String(actor?.name || "").slice(0, 255), step.note]
    );
    await client.query("COMMIT");
    return Number(entry.id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
