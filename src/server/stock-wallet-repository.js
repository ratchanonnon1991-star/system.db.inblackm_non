import { getPool } from "@/lib/db";
import {
  DEFAULT_WALLETS,
  fromWalletUnits,
  toWalletUnits,
  reviewWalletAdjust,
  validateWalletEntry,
  walletCheckSignature,
  walletKey,
  walletStatusChange,
  walletStatusDecision,
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
      // The sheet's columns, kept as notes beside the entry.
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS channel VARCHAR(100) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS destination_account VARCHAR(200) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS seller VARCHAR(120) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS buyer VARCHAR(120) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS credit NUMERIC(30, 8)`);
      // Entries brought in from the accounting sheets name their sheet row, so an import can replace them.
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS source_ref VARCHAR(200)`);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_wallet_entries_source_idx ON stock_wallet_entries (source_ref) WHERE source_ref IS NOT NULL`);
      // Where the money went and its proof (the sheet row's other columns), and the sheet row itself.
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '[]'::jsonb`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS sheet_period CHAR(7)`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS sheet_tab VARCHAR(200)`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS sheet_row INTEGER`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS received_sheet JSONB`);
      // Taking a done payment back to "waiting for goods" needs a second person.
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS status_request VARCHAR(20)`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS status_request_by_id INTEGER`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS status_request_by VARCHAR(255) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS status_request_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS status_request_reason TEXT NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS status_changed_by VARCHAR(255) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_wallet_entries ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ`);
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
      await client.query(`ALTER TABLE stock_wallets ADD COLUMN IF NOT EXISTS wallet_group VARCHAR(16) NOT NULL DEFAULT 'main'`);
      // Month by month: the sheet's balances beside the system's, and who checked them.
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_wallet_sheet_checks (
          wallet_id     INTEGER NOT NULL REFERENCES stock_wallets(id) ON DELETE CASCADE,
          period        CHAR(7) NOT NULL,
          currency      VARCHAR(5) NOT NULL,
          tab_name      VARCHAR(200) NOT NULL DEFAULT '',
          sheet_open    NUMERIC(30, 8),
          system_open   NUMERIC(30, 8),
          sheet_close   NUMERIC(30, 8),
          system_close  NUMERIC(30, 8),
          rows          INTEGER NOT NULL DEFAULT 0,
          drifts        JSONB NOT NULL DEFAULT '[]'::jsonb,
          checked_by_id INTEGER,
          checked_by    VARCHAR(255) NOT NULL DEFAULT '',
          checked_at    TIMESTAMPTZ,
          checked_note  TEXT NOT NULL DEFAULT '',
          checked_sig   TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (wallet_id, period, currency)
        )
      `);
      for (const wallet of DEFAULT_WALLETS) {
        // A wallet already there keeps its name and role; its group and place follow the list.
        await client.query(
          `INSERT INTO stock_wallets (code, name, currencies, role, sort_order, wallet_group) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (code) DO UPDATE SET sort_order = EXCLUDED.sort_order, wallet_group = EXCLUDED.wallet_group`,
          [wallet.code, wallet.name, wallet.currencies, wallet.role, wallet.sortOrder, wallet.group]
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

const mapWallet = (row) => ({ id: row.id, code: row.code, name: row.name, currencies: row.currencies, role: row.role, status: row.status, group: row.wallet_group || "main" });

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
  const last = Object.fromEntries((await pool.query(
    `SELECT l.wallet_id, MAX(e.occurred_at) AS at FROM stock_wallet_legs l JOIN stock_wallet_entries e ON e.id = l.entry_id
      WHERE e.kind <> 'adjust' GROUP BY l.wallet_id`
  )).rows.map((row) => [row.wallet_id, row.at]));
  return rows.map((row) => ({
    ...mapWallet(row),
    lastActivity: last[row.id] || null,
    balances: row.currencies.map((currency) => {
      const total = totals[walletKey(row.id, currency)];
      return { currency, balance: total ? fromWalletUnits(toWalletUnits(total.balance)) : "0", fees: total ? fromWalletUnits(toWalletUnits(total.fees)) : "0" };
    }),
  }));
}

/**
 * Entries newest first (by receipt time) with their legs. `walletId` narrows to
 * one wallet, `month` ("2026-10") to one month, `kind` to one kind, `q` to a
 * text in the title, note or details, `issues` to corrections and entries
 * waiting for a second person.
 */
export async function listWalletEntries({ walletId = null, walletIds = null, orderId = null, month = "", kind = "", q = "", issues = false, limit = 300 } = {}) {
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
      WHERE ($1::int[] IS NULL OR EXISTS (SELECT 1 FROM stock_wallet_legs x WHERE x.entry_id = e.id AND x.wallet_id = ANY($1::int[])))
        AND ($2::int IS NULL OR e.order_id = $2)
        AND ($4 = '' OR to_char(e.occurred_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') = $4)
        AND ($5 = '' OR e.kind = $5)
        AND ($6 = '' OR lower(e.title || ' ' || e.note || ' ' || e.destination_account || ' ' || e.details::text) LIKE $6)
        AND (NOT $7::boolean OR e.kind = 'adjust' OR e.status_request IS NOT NULL OR e.status = 'awaiting_approval')
      GROUP BY e.id, o.status
      ORDER BY e.occurred_at DESC, e.id DESC
      LIMIT $3`,
    [walletIds?.length ? walletIds.map(Number) : walletId ? [Number(walletId)] : null, orderId ? Number(orderId) : null, Math.min(Math.max(Number(limit) || 300, 1), 1000),
      /^\d{4}-\d{2}$/.test(month) ? month : "", WALLET_ENTRY_KINDS.includes(kind) ? kind : "",
      q ? `%${String(q).trim().toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`)}%` : "", Boolean(issues)]
  );
  const clean = (value) => fromWalletUnits(toWalletUnits(value));
  return result.rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    title: row.title,
    note: row.note,
    txid: row.txid,
    channel: row.channel,
    destinationAccount: row.destination_account,
    seller: row.seller,
    buyer: row.buyer,
    credit: row.credit == null ? "" : clean(row.credit),
    status: row.status,
    actorId: row.actor_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    orderId: row.order_id,
    orderStatus: row.order_status,
    occurredAt: row.occurred_at,
    actorName: row.actor_name,
    details: Array.isArray(row.details) ? row.details : [],
    sheet: row.sheet_period ? { period: row.sheet_period, tab: row.sheet_tab, rowNo: row.sheet_row } : null,
    receivedSheet: row.received_sheet || null,
    statusRequest: row.status_request
      ? { to: row.status_request, byId: row.status_request_by_id, by: row.status_request_by, at: row.status_request_at, reason: row.status_request_reason }
      : null,
    statusChangedBy: row.status_changed_by,
    statusChangedAt: row.status_changed_at,
    legs: row.legs.map((leg) => ({ ...leg, amount: clean(leg.amount), fee: clean(leg.fee), balanceAfter: clean(leg.balanceAfter) })),
  }));
}

/**
 * The sheet-against-system checks of one wallet (or all), newest month first:
 * [{ walletId, period, currency, tab, sheetOpen, systemOpen, sheetClose,
 * systemClose, rows, drifts, checkedBy, checkedAt, checkedNote, checkedStale }].
 * A check stays "checked" only while its numbers are the ones that were checked.
 */
export async function listWalletChecks({ walletId = null } = {}) {
  await ensureWalletSchema();
  const result = await getPool().query(
    `SELECT * FROM stock_wallet_sheet_checks WHERE ($1::int IS NULL OR wallet_id = $1) ORDER BY period DESC, wallet_id, currency`,
    [walletId ? Number(walletId) : null]
  );
  const num = (value) => (value == null ? null : fromWalletUnits(toWalletUnits(value)));
  return result.rows.map((row) => {
    const check = {
      walletId: row.wallet_id, period: row.period, currency: row.currency, tab: row.tab_name,
      sheetOpen: num(row.sheet_open), systemOpen: num(row.system_open), sheetClose: num(row.sheet_close), systemClose: num(row.system_close),
      rows: row.rows, drifts: row.drifts || [], checkedBy: row.checked_by, checkedAt: row.checked_at, checkedNote: row.checked_note,
    };
    return { ...check, checkedStale: Boolean(row.checked_at) && row.checked_sig !== walletCheckSignature(check) };
  });
}

/** Marks one wallet-month-currency as checked by a person, for the numbers shown now. */
export async function markWalletCheck({ walletId, period, currency }, actor, note = "") {
  await ensureWalletSchema();
  const pool = getPool();
  const [check] = (await listWalletChecks({ walletId })).filter((item) => item.period === period && item.currency === currency);
  if (!check) throw createHttpError("ไม่พบเดือนนี้ของกระเป๋านี้", 404);
  await pool.query(
    `UPDATE stock_wallet_sheet_checks SET checked_by_id = $4, checked_by = $5, checked_at = NOW(), checked_note = $6, checked_sig = $7
      WHERE wallet_id = $1 AND period = $2 AND currency = $3`,
    [Number(walletId), period, currency, actor?.id ?? null, String(actor?.name || "").slice(0, 255), String(note || "").slice(0, 500), walletCheckSignature(check)]
  );
  return true;
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
    `INSERT INTO stock_wallet_entries (kind, title, note, txid, status, order_id, occurred_at, actor_id, actor_name,
                                       channel, destination_account, seller, buyer, credit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [entry.kind, entry.title, entry.note, entry.txid, entry.status, orderId, entry.occurredAt, actor?.id ?? null, String(actor?.name || "").slice(0, 255),
      entry.channel, entry.destinationAccount, entry.seller, entry.buyer, entry.credit === "" ? null : entry.credit]
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

const entryForStatus = (row) => ({
  kind: row.kind, status: row.status, orderId: row.order_id,
  statusRequest: row.status_request ? { to: row.status_request, byId: row.status_request_by_id } : null,
});

/**
 * A payment made outside a purchase order: waiting for goods → done at once;
 * done → waiting only as a request (with a reason) that someone else confirms.
 * Returns { entryId, requested }.
 */
export async function setWalletPaymentStatus(entryId, status, actor = null, reason = "") {
  await ensureWalletSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query(`SELECT * FROM stock_wallet_entries WHERE id = $1 FOR UPDATE`, [Number(entryId)])).rows[0];
    if (!row) throw createHttpError("ไม่พบรายการนี้", 404);
    const step = walletStatusChange(entryForStatus(row), status, actor, reason);
    if (step.error) throw createHttpError(step.error, 400);
    if (step.request) {
      await client.query(
        `UPDATE stock_wallet_entries SET status_request = $2, status_request_by_id = $3, status_request_by = $4, status_request_at = NOW(), status_request_reason = $5 WHERE id = $1`,
        [row.id, step.request.to, step.request.byId, step.request.by, step.request.reason]
      );
    } else {
      await client.query(`UPDATE stock_wallet_entries SET status = $2, status_changed_by = $3, status_changed_at = NOW() WHERE id = $1`,
        [row.id, step.status, String(actor?.name || "").slice(0, 255)]);
    }
    await client.query("COMMIT");
    return { entryId: Number(row.id), requested: Boolean(step.request) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Confirms ("approve"), refuses ("reject") or withdraws ("cancel") a status request. */
export async function decideWalletStatus(entryId, decision, actor) {
  await ensureWalletSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query(`SELECT * FROM stock_wallet_entries WHERE id = $1 FOR UPDATE`, [Number(entryId)])).rows[0];
    if (!row) throw createHttpError("ไม่พบรายการนี้", 404);
    const step = walletStatusDecision(entryForStatus(row), decision, actor);
    if (step.error) throw createHttpError(step.error, 400);
    const by = String(actor?.name || "").slice(0, 255);
    await client.query(
      `UPDATE stock_wallet_entries
          SET status = COALESCE($2, status),
              status_changed_by = CASE WHEN $2::text IS NULL THEN status_changed_by ELSE $3 || ' (ขอโดย ' || status_request_by || ')' END,
              status_changed_at = CASE WHEN $2::text IS NULL THEN status_changed_at ELSE NOW() END,
              review_note = CASE WHEN $4 = 'reject' THEN 'ไม่ยืนยันเปลี่ยนสถานะ: ' || $3 ELSE review_note END,
              status_request = NULL, status_request_by_id = NULL, status_request_by = '', status_request_at = NULL, status_request_reason = ''
        WHERE id = $1`,
      [row.id, step.status, by, decision]
    );
    await client.query("COMMIT");
    return Number(row.id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Corrections awaiting approval, oldest first, for the Stock front page. */
export async function listWalletAdjustsAwaiting() {
  const entries = await listWalletEntries({ issues: true, limit: 1000 });
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
