import { getPool } from "@/lib/db";
import {
  applyPurchaseOrderAction,
  DELIVERY_METHODS,
  PO_STATUSES,
  topupCheck,
  purchaseOrderThb,
  validatePurchaseOrder,
} from "@/lib/stock-purchase-orders";
import { ensureStockSchema, insertStockMove } from "@/server/stock-repository";
import { ensureWalletSchema, insertWalletEntry } from "@/server/stock-wallet-repository";
import { fromWalletUnits, toWalletUnits } from "@/lib/stock-wallets";

// Purchase orders (src/lib/stock-purchase-orders.js): one order buys packs for
// one stock account. Every step is an event row, so the history of who paid,
// received or asked for a refund stays even after the order is closed.
// Each delivery is its own row with its proof (account topped up and its
// balance before/after, the supplier's order number, a picture link) and who
// recorded it; checking it is a separate step by whoever checks.
// Paying from a wallet writes the wallet payment (src/lib/stock-wallets.js) in
// the same transaction; the refund goes back to the wallet that paid.
let schemaReady;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function ensurePurchaseOrderSchema() {
  return ensureSchema();
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await ensureStockSchema();
    await ensureWalletSchema();
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_purchase_orders (
          id              SERIAL PRIMARY KEY,
          account_id      INTEGER NOT NULL REFERENCES stock_accounts(id) ON DELETE RESTRICT,
          status          VARCHAR(20) NOT NULL DEFAULT 'requested'
                          CHECK (status IN (${PO_STATUSES.map((status) => `'${status}'`).join(", ")})),
          supplier        VARCHAR(120) NOT NULL,
          payment_channel VARCHAR(120) NOT NULL DEFAULT '',
          buyer           VARCHAR(120) NOT NULL DEFAULT '',
          currency        VARCHAR(5) NOT NULL DEFAULT 'THB',
          amount          NUMERIC(30, 8) NOT NULL CHECK (amount > 0),
          rate_thb        NUMERIC(18, 6),
          refund_amount   NUMERIC(30, 8),
          paid_wallet_id  INTEGER REFERENCES stock_wallets(id) ON DELETE RESTRICT,
          paid_at         TIMESTAMPTZ,
          supplier_ref    VARCHAR(120) NOT NULL DEFAULT '',
          refund_requested_by_id INTEGER,
          receipt_url     TEXT NOT NULL DEFAULT '',
          note            TEXT NOT NULL DEFAULT '',
          created_by_id   INTEGER,
          created_by_name VARCHAR(255) NOT NULL DEFAULT '',
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Tables made before wallets existed: 8 decimals (BTC) and the paying wallet.
      await client.query(`ALTER TABLE stock_purchase_orders ALTER COLUMN amount TYPE NUMERIC(30, 8), ALTER COLUMN refund_amount TYPE NUMERIC(30, 8)`);
      await client.query(`ALTER TABLE stock_purchase_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
      await client.query(`ALTER TABLE stock_purchase_orders ADD COLUMN IF NOT EXISTS supplier_ref VARCHAR(120) NOT NULL DEFAULT ''`);
      await client.query(`ALTER TABLE stock_purchase_orders ADD COLUMN IF NOT EXISTS refund_requested_by_id INTEGER`);
      // The step list grew (accepted, delivered): tables made before keep an older CHECK.
      await client.query(`ALTER TABLE stock_purchase_orders DROP CONSTRAINT IF EXISTS stock_purchase_orders_status_check`);
      await client.query(`ALTER TABLE stock_purchase_orders ADD CONSTRAINT stock_purchase_orders_status_check
                             CHECK (status IN (${PO_STATUSES.map((status) => `'${status}'`).join(", ")}))`);
      await client.query(`ALTER TABLE stock_purchase_orders ADD COLUMN IF NOT EXISTS paid_wallet_id INTEGER REFERENCES stock_wallets(id) ON DELETE RESTRICT`);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_purchase_orders_status_idx ON stock_purchase_orders (status, created_at DESC)`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_purchase_order_lines (
          id            SERIAL PRIMARY KEY,
          order_id      INTEGER NOT NULL REFERENCES stock_purchase_orders(id) ON DELETE CASCADE,
          item_id       INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
          qty_ordered   INTEGER NOT NULL CHECK (qty_ordered > 0),
          qty_received  INTEGER NOT NULL DEFAULT 0 CHECK (qty_received >= 0 AND qty_received <= qty_ordered),
          unit_cost     NUMERIC(14, 2),
          UNIQUE (order_id, item_id)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_purchase_order_events (
          id          BIGSERIAL PRIMARY KEY,
          order_id    INTEGER NOT NULL REFERENCES stock_purchase_orders(id) ON DELETE CASCADE,
          action      VARCHAR(20) NOT NULL,
          from_status VARCHAR(20),
          to_status   VARCHAR(20) NOT NULL,
          note        TEXT NOT NULL DEFAULT '',
          move_id     BIGINT REFERENCES stock_moves(id) ON DELETE SET NULL,
          wallet_entry_id BIGINT REFERENCES stock_wallet_entries(id) ON DELETE SET NULL,
          actor_id    INTEGER,
          actor_name  VARCHAR(255) NOT NULL DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`ALTER TABLE stock_purchase_order_events ADD COLUMN IF NOT EXISTS wallet_entry_id BIGINT REFERENCES stock_wallet_entries(id) ON DELETE SET NULL`);
      // Orders paid before paid_at existed take their wallet payment's receipt time, else the pay step's.
      await client.query(`UPDATE stock_purchase_orders o
                              SET paid_at = COALESCE((SELECT w.occurred_at FROM stock_wallet_entries w WHERE w.id = e.wallet_entry_id), e.created_at)
                             FROM stock_purchase_order_events e
                            WHERE e.order_id = o.id AND e.action = 'pay' AND o.paid_at IS NULL`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_purchase_order_deliveries (
          id              SERIAL PRIMARY KEY,
          order_id        INTEGER NOT NULL REFERENCES stock_purchase_orders(id) ON DELETE CASCADE,
          method          VARCHAR(10) NOT NULL CHECK (method IN (${DELIVERY_METHODS.map((method) => `'${method}'`).join(", ")})),
          status          VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
          lines           JSONB NOT NULL DEFAULT '[]',
          from_status     VARCHAR(20) NOT NULL,
          supplier_ref    VARCHAR(120) NOT NULL DEFAULT '',
          refund_requested_by_id INTEGER,
          topup_account   VARCHAR(200) NOT NULL DEFAULT '',
          balance_before  NUMERIC(30, 8),
          balance_after   NUMERIC(30, 8),
          expected        NUMERIC(30, 8),
          proof_url       TEXT NOT NULL DEFAULT '',
          expires_on      DATE,
          note            TEXT NOT NULL DEFAULT '',
          recorded_by_id  INTEGER,
          recorded_by     VARCHAR(255) NOT NULL DEFAULT '',
          checked_by_id   INTEGER,
          checked_by      VARCHAR(255) NOT NULL DEFAULT '',
          checked_at      TIMESTAMPTZ,
          check_note      TEXT NOT NULL DEFAULT '',
          move_id         BIGINT REFERENCES stock_moves(id) ON DELETE SET NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_purchase_order_deliveries_order_idx ON stock_purchase_order_deliveries (order_id, created_at)`);
      await client.query(`CREATE INDEX IF NOT EXISTS stock_purchase_order_events_order_idx ON stock_purchase_order_events (order_id, created_at)`);
    } finally {
      client.release();
    }
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

const number = (value) => (value == null ? null : Number(value));
const exact = (value) => (value == null ? null : fromWalletUnits(toWalletUnits(value)));
const poCode = (id) => `PO-${String(id).padStart(5, "0")}`;

function mapOrder(row) {
  const order = {
    id: row.id,
    code: poCode(row.id),
    accountId: row.account_id,
    accountCode: row.account_code,
    gameName: row.game_name || "",
    status: row.status,
    supplier: row.supplier,
    paymentChannel: row.payment_channel,
    buyer: row.buyer,
    currency: row.currency,
    amount: exact(row.amount),
    rateThb: number(row.rate_thb),
    refundAmount: exact(row.refund_amount),
    paidWalletId: row.paid_wallet_id,
    paidWalletName: row.paid_wallet_name || "",
    receiptUrl: row.receipt_url,
    note: row.note,
    createdByName: row.created_by_name,
    paidAt: row.paid_at,
    supplierRef: row.supplier_ref || "",
    searchText: row.search_text || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines: (row.lines || []).map((line) => ({
      itemId: line.itemId,
      label: line.label,
      qtyOrdered: line.qtyOrdered,
      qtyReceived: line.qtyReceived,
      unitCost: number(line.unitCost),
    })),
  };
  order.amountThb = purchaseOrderThb(order);
  order.qtyOrdered = order.lines.reduce((sum, line) => sum + line.qtyOrdered, 0);
  order.qtyReceived = order.lines.reduce((sum, line) => sum + line.qtyReceived, 0);
  return order;
}

const ORDER_SQL = `
  SELECT o.*, a.code AS account_code, a.game_name, pw.name AS paid_wallet_name,
         CONCAT_WS(' ',
           (SELECT string_agg(CONCAT_WS(' ', d.supplier_ref, d.topup_account), ' ') FROM stock_purchase_order_deliveries d WHERE d.order_id = o.id),
           (SELECT string_agg(w.txid, ' ') FROM stock_wallet_entries w WHERE w.order_id = o.id)) AS search_text,
         COALESCE(json_agg(json_build_object('itemId', l.item_id, 'label', i.label, 'qtyOrdered', l.qty_ordered,
                  'qtyReceived', l.qty_received, 'unitCost', l.unit_cost) ORDER BY i.sort_order, i.id)
                  FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
    FROM stock_purchase_orders o
    JOIN stock_accounts a ON a.id = o.account_id
    LEFT JOIN stock_wallets pw ON pw.id = o.paid_wallet_id
    LEFT JOIN stock_purchase_order_lines l ON l.order_id = o.id
    LEFT JOIN stock_items i ON i.id = l.item_id`;

/** Orders newest first; `status` narrows to one step. */
export async function listPurchaseOrders({ status = null, limit = 300 } = {}) {
  await ensureSchema();
  const result = await getPool().query(
    `${ORDER_SQL}
      WHERE ($1::text IS NULL OR o.status = $1)
      GROUP BY o.id, a.id, pw.id
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT $2`,
    [PO_STATUSES.includes(status) ? status : null, Math.min(Math.max(Number(limit) || 300, 1), 1000)]
  );
  return result.rows.map(mapOrder);
}

/** One order with its steps, oldest first. */
export async function getPurchaseOrder(id) {
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query(`${ORDER_SQL} WHERE o.id = $1 GROUP BY o.id, a.id, pw.id`, [Number(id)]);
  if (!result.rows[0]) return null;
  const events = await pool.query(
    `SELECT id, action, from_status, to_status, note, move_id, wallet_entry_id, actor_name, created_at
       FROM stock_purchase_order_events WHERE order_id = $1 ORDER BY created_at, id`,
    [Number(id)]
  );
  const deliveries = await pool.query(
    `SELECT * FROM stock_purchase_order_deliveries WHERE order_id = $1 ORDER BY created_at, id`,
    [Number(id)]
  );
  const order = mapOrder(result.rows[0]);
  const labels = new Map(order.lines.map((line) => [line.itemId, line.label]));
  return {
    ...order,
    deliveries: deliveries.rows.map((row) => mapDelivery(row, labels)),
    events: events.rows.map((row) => ({
      id: Number(row.id),
      action: row.action,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      note: row.note,
      moveId: row.move_id == null ? null : Number(row.move_id),
      walletEntryId: row.wallet_entry_id == null ? null : Number(row.wallet_entry_id),
      actorName: row.actor_name,
      createdAt: row.created_at,
    })),
  };
}

function mapDelivery(row, labels = new Map()) {
  const delivery = {
    id: row.id,
    method: row.method,
    status: row.status,
    lines: (row.lines || []).map((line) => ({ ...line, label: labels.get(line.itemId) || "" })),
    fromStatus: row.from_status,
    supplierRef: row.supplier_ref,
    topupAccount: row.topup_account,
    balanceBefore: exact(row.balance_before),
    balanceAfter: exact(row.balance_after),
    expected: exact(row.expected),
    proofUrl: row.proof_url,
    expiresOn: row.expires_on ? new Date(row.expires_on).toISOString().slice(0, 10) : "",
    note: row.note,
    recordedBy: row.recorded_by,
    checkedBy: row.checked_by,
    checkedAt: row.checked_at,
    checkNote: row.check_note,
    moveId: row.move_id == null ? null : Number(row.move_id),
    createdAt: row.created_at,
  };
  delivery.topup = row.method === "topup" ? topupCheck(delivery) : null;
  delivery.selfChecked = Boolean(row.checked_by_id && row.recorded_by_id && row.checked_by_id === row.recorded_by_id);
  return delivery;
}

// When the money went out: the receipt time typed, else now.
const paidAtFor = (value) => {
  const at = value ? new Date(value) : new Date();
  return Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString();
};

const actorFields = (actor) => [actor?.id ?? null, String(actor?.name || "").slice(0, 255)];

export async function createPurchaseOrder(input, actor = null) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const accountId = Number(input?.accountId);
    const account = await client.query(`SELECT id, status FROM stock_accounts WHERE id = $1`, [accountId]);
    if (!account.rows[0]) throw createHttpError("เลือกไอดี stock ที่จะรับของเข้า", 400);
    if (account.rows[0].status === "closed") throw createHttpError("ไอดีนี้ปิดแล้ว", 400);
    const items = await client.query(`SELECT id FROM stock_items WHERE account_id = $1`, [accountId]);
    const checked = validatePurchaseOrder(input, items.rows.map((row) => row.id));
    if (checked.error) throw createHttpError(checked.error, 400);
    const { order } = checked;

    const created = await client.query(
      `INSERT INTO stock_purchase_orders
         (account_id, supplier, payment_channel, buyer, currency, amount, rate_thb, receipt_url, note, created_by_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [accountId, order.supplier, order.paymentChannel, order.buyer, order.currency, order.amount,
        order.rateThb === "" ? null : Number(order.rateThb), order.receiptUrl, order.note, ...actorFields(actor)]
    );
    const orderId = created.rows[0].id;
    for (const line of checked.lines) {
      await client.query(
        `INSERT INTO stock_purchase_order_lines (order_id, item_id, qty_ordered, unit_cost) VALUES ($1, $2, $3, $4)`,
        [orderId, line.itemId, line.qty, line.unitCost === "" ? null : Number(line.unitCost)]
      );
    }
    await client.query(
      `INSERT INTO stock_purchase_order_events (order_id, action, from_status, to_status, note, actor_id, actor_name)
       VALUES ($1, 'create', NULL, 'requested', '', $2, $3)`,
      [orderId, ...actorFields(actor)]
    );
    await client.query("COMMIT");
    return getPurchaseOrder(orderId);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Takes one step on an order. The order row is locked while its status and
 * lines are read, so two people cannot receive the same goods twice. Checking a
 * delivery writes the stock "in" move in the same transaction: both land or neither.
 */
export async function takePurchaseOrderAction(id, action, input = {}, actor = null) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(`SELECT * FROM stock_purchase_orders WHERE id = $1 FOR UPDATE`, [Number(id)]);
    const row = locked.rows[0];
    if (!row) throw createHttpError("ไม่พบใบสั่งซื้อนี้", 404);
    const lines = await client.query(
      `SELECT l.item_id, l.qty_ordered, l.qty_received, l.unit_cost, i.label
         FROM stock_purchase_order_lines l JOIN stock_items i ON i.id = l.item_id
        WHERE l.order_id = $1`,
      [row.id]
    );
    const pending = (await client.query(
      `SELECT * FROM stock_purchase_order_deliveries WHERE order_id = $1 AND status = 'pending' ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [row.id]
    )).rows[0];
    const order = {
      status: row.status,
      amount: row.amount,
      createdById: row.created_by_id,
      refundRequestedById: row.refund_requested_by_id,
      delivery: pending ? { lines: pending.lines, fromStatus: pending.from_status, recordedById: pending.recorded_by_id } : null,
      lines: lines.rows.map((line) => ({
        itemId: line.item_id,
        qtyOrdered: line.qty_ordered,
        qtyReceived: line.qty_received,
        unitCost: line.unit_cost,
        label: line.label,
      })),
    };
    const step = applyPurchaseOrderAction(order, action, input, actor);
    if (step.error) throw createHttpError(step.error, 400);

    let moveId = null;
    let walletEntryId = null;
    let paidWalletId = row.paid_wallet_id;
    const title = `${poCode(row.id)} · ${row.supplier} · ${order.lines.map((line) => `${line.label} × ${line.qtyOrdered}`).join(", ")}`.slice(0, 200);
    if (action === "pay" && input.walletId) {
      paidWalletId = Number(input.walletId);
      walletEntryId = await insertWalletEntry(client, {
        kind: "payment", fromWalletId: paidWalletId, fromCurrency: row.currency, amount: row.amount, fee: input.fee,
        title, txid: input.txid, occurredAt: input.occurredAt, note: step.note,
      }, actor, { orderId: row.id });
    }
    if (action === "refund" && row.paid_wallet_id && row.refund_amount != null) {
      walletEntryId = await insertWalletEntry(client, {
        kind: "refund", toWalletId: row.paid_wallet_id, toCurrency: row.currency, amount: row.refund_amount,
        title: `คืนเงิน ${title}`.slice(0, 200), txid: input.txid, occurredAt: input.occurredAt, note: step.note,
      }, actor, { orderId: row.id });
    }
    if (action === "deliver") {
      const d = step.delivery;
      await client.query(
        `INSERT INTO stock_purchase_order_deliveries
           (order_id, method, lines, from_status, supplier_ref, topup_account, balance_before, balance_after, expected,
            proof_url, expires_on, note, recorded_by_id, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [row.id, d.method, JSON.stringify(d.lines), d.fromStatus, d.supplierRef || row.supplier_ref, d.topupAccount,
          d.balanceBefore || null, d.balanceAfter || null, d.expected || null, d.proofUrl, d.expiresOn || null, step.note || "", ...actorFields(actor)]
      );
    }
    if (action === "reject_delivery") {
      await client.query(
        `UPDATE stock_purchase_order_deliveries SET status = 'rejected', checked_by_id = $2, checked_by = $3, checked_at = NOW(), check_note = $4 WHERE id = $1`,
        [pending.id, ...actorFields(actor), step.note]
      );
    }
    if (action === "verify") {
      const byId = new Map(order.lines.map((line) => [line.itemId, line]));
      moveId = await insertStockMove(client, {
        accountId: row.account_id,
        kind: "in",
        note: `รับจากใบสั่งซื้อ ${poCode(row.id)} · ${row.supplier}${pending.supplier_ref ? ` · ORDER ${pending.supplier_ref}` : ""}`.slice(0, 500),
        lines: step.received.map((line) => ({ itemId: line.itemId, qty: line.qty, unitCost: byId.get(line.itemId).unitCost ?? "" })),
      }, actor);
      for (const line of step.received) {
        await client.query(
          `UPDATE stock_purchase_order_lines SET qty_received = qty_received + $3 WHERE order_id = $1 AND item_id = $2`,
          [row.id, line.itemId, line.qty]
        );
      }
      await client.query(
        `UPDATE stock_purchase_order_deliveries SET status = 'verified', checked_by_id = $2, checked_by = $3, checked_at = NOW(), check_note = $4, move_id = $5 WHERE id = $1`,
        [pending.id, ...actorFields(actor), step.note || "", moveId]
      );
    }

    await client.query(
      `UPDATE stock_purchase_orders
          SET status = $2, refund_amount = COALESCE($3, refund_amount), paid_wallet_id = $4,
              paid_at = CASE WHEN $5::timestamptz IS NOT NULL THEN $5::timestamptz ELSE paid_at END,
              supplier_ref = COALESCE(NULLIF($6, ''), supplier_ref),
              refund_requested_by_id = CASE WHEN $7 THEN $8::int ELSE refund_requested_by_id END, updated_at = NOW()
        WHERE id = $1`,
      [row.id, step.status, step.refundAmount || null, paidWalletId, action === "pay" ? paidAtFor(input.occurredAt) : null,
        step.supplierRef || step.delivery?.supplierRef || "", action === "request_refund", actor?.id ?? null]
    );
    await client.query(
      `INSERT INTO stock_purchase_order_events (order_id, action, from_status, to_status, note, move_id, wallet_entry_id, actor_id, actor_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [row.id, action, row.status, step.status, step.note || "", moveId, walletEntryId, ...actorFields(actor)]
    );
    await client.query("COMMIT");
    return getPurchaseOrder(row.id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** The latest steps across all orders, newest first, for the Stock front page. */
export async function listRecentPurchaseOrderEvents(limit = 12) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT e.id, e.order_id, e.action, e.to_status, e.note, e.actor_name, e.created_at, o.supplier
       FROM stock_purchase_order_events e JOIN stock_purchase_orders o ON o.id = e.order_id
      ORDER BY e.created_at DESC, e.id DESC LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 12, 1), 100)]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    orderId: row.order_id,
    orderCode: poCode(row.order_id),
    supplier: row.supplier,
    action: row.action,
    toStatus: row.to_status,
    note: row.note,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }));
}
