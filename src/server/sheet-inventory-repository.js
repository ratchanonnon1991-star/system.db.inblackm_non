import { getPool } from "@/lib/db";
import { ACCOUNT_SHEET_ACTOR } from "@/lib/account-sheets";
import { sheetInventoryMoves } from "@/lib/sheet-inventory";
import { ensurePurchaseOrderSchema } from "@/server/stock-purchase-order-repository";

// Writes what planSheetInventory read from the sheets into Stock: the stock IDs and
// their packs (kept and updated, never deleted), and the purchase orders, receipts and
// count corrections (replaced on every run: all rows whose actor is the sheet importer).
// A person's own moves and orders are never touched.

const SHEET_NOTE = "จากชีตข้อมูลบัญชี";
const DAY = 86400000;

/**
 * plan: planSheetInventory's result; idNotes: { code: text } added to each ID's note
 * (e.g. the Stock to THB value). Returns what was written.
 */
export async function replaceSheetInventory(plan, idNotes = {}) {
  await ensurePurchaseOrderSchema();
  const { moves, balances } = sheetInventoryMoves(plan.events);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Wallet payments point at orders without a foreign key: unlink the ones about to go.
    await client.query(`UPDATE stock_wallet_entries SET order_id = NULL WHERE order_id IN (
      SELECT id FROM stock_purchase_orders WHERE created_by_name = $1 AND created_by_id IS NULL)`, [ACCOUNT_SHEET_ACTOR]);
    const ordersRemoved = await client.query(`DELETE FROM stock_purchase_orders WHERE created_by_name = $1 AND created_by_id IS NULL`, [ACCOUNT_SHEET_ACTOR]);
    const movesRemoved = await client.query(`DELETE FROM stock_moves WHERE actor_name = $1 AND actor_id IS NULL`, [ACCOUNT_SHEET_ACTOR]);

    const codes = new Set([...plan.accounts.map((entry) => entry.code), ...Object.keys(idNotes)]);
    const accountIds = {};
    const itemIds = {};
    for (const code of codes) {
      const entry = plan.accounts.find((candidate) => candidate.code === code) || { code, game: "", items: [] };
      const note = [`${SHEET_NOTE}: ไอดีนี้และแพ็คสร้างจากชีต 1.1 รายการสั่งซื้อ Stock iOS และยอดนับใน 1.4 Cash Flow ชีตไม่มีบันทึกการตัดของออก ยอดหลังการนับครั้งล่าสุดจึงยังไม่หักของที่ขายไป ต้องนับของจริงก่อนใช้ยอดนี้`, idNotes[code]]
        .filter(Boolean).join("\n").slice(0, 1000);
      // A note someone wrote stays; only the importer's own note is refreshed.
      const row = (await client.query(
        `INSERT INTO stock_accounts (code, game_name, status, note) VALUES ($1, $2, 'check', $3)
         ON CONFLICT (code) DO UPDATE SET
           game_name = CASE WHEN stock_accounts.game_name = '' THEN EXCLUDED.game_name ELSE stock_accounts.game_name END,
           note = CASE WHEN stock_accounts.note = '' OR stock_accounts.note LIKE '${SHEET_NOTE}%' THEN EXCLUDED.note ELSE stock_accounts.note END,
           updated_at = NOW()
         RETURNING id`,
        [code, entry.game, note]
      )).rows[0];
      accountIds[code] = row.id;
      itemIds[code] = {};
      for (const [index, item] of entry.items.entries()) {
        const saved = (await client.query(
          `INSERT INTO stock_items (account_id, label, unit_usd, pack_name, sort_order) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (account_id, label) DO UPDATE SET pack_name = CASE WHEN EXCLUDED.pack_name <> '' THEN EXCLUDED.pack_name ELSE stock_items.pack_name END,
             unit_usd = COALESCE(stock_items.unit_usd, EXCLUDED.unit_usd)
           RETURNING id`,
          [row.id, item.label, item.unitUsd, item.packName, index + 1]
        )).rows[0];
        itemIds[code][item.label] = saved.id;
      }
    }

    let orders = 0;
    let adjusts = 0;
    const written = [];
    for (const move of moves) {
      const accountId = accountIds[move.code];
      const merged = {};
      for (const line of move.lines) merged[line.label] = (merged[line.label] || 0) + line.qty;
      const lines = Object.entries(merged).filter(([, qty]) => qty !== 0);
      if (!lines.length) continue;
      const moveId = (await client.query(
        `INSERT INTO stock_moves (account_id, kind, note, actor_name, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [accountId, move.kind, move.note.slice(0, 1000), ACCOUNT_SHEET_ACTOR, move.when]
      )).rows[0].id;
      for (const [label, qty] of lines) {
        await client.query(`INSERT INTO stock_move_lines (move_id, item_id, qty) VALUES ($1, $2, $3)`, [moveId, itemIds[move.code][label], qty]);
      }
      if (move.kind === "adjust") {
        adjusts += 1;
        continue;
      }
      const order = move.order;
      const usdt = order.usdt > 0 ? order.usdt : null;
      const currency = usdt ? "USDT" : "USD";
      const amount = usdt || order.totalUsd || lines.reduce((sum, [label, qty]) => sum + Number.parseFloat(label) * qty, 0);
      const note = [
        `ยกมาจากชีต ${order.sheet.fileName} › ${order.sheet.tab} แถว ${order.sheet.rowNo}`,
        order.totalUsd ? `มูลค่าแพ็ค ${order.totalUsd} USD` : "",
        order.productRate ? `Product Rate ${order.productRate} CNY/USD` : "",
        order.cnyRate ? `CNY Rate ${order.cnyRate} CNY/USDT` : "",
      ].filter(Boolean).join(" · ");
      const orderId = (await client.query(
        `INSERT INTO stock_purchase_orders (account_id, status, supplier, currency, amount, receipt_url, note, created_by_name, created_at, updated_at, supplier_ref)
         VALUES ($1, 'received', $2, $3, $4, $5, $6, $7, $8, $8, $9) RETURNING id`,
        [accountId, order.supplier, currency, amount, order.receiptUrl, note, ACCOUNT_SHEET_ACTOR, order.when, order.ref]
      )).rows[0].id;
      for (const [label, qty] of lines) {
        await client.query(`INSERT INTO stock_purchase_order_lines (order_id, item_id, qty_ordered, qty_received) VALUES ($1, $2, $3, $3)`, [orderId, itemIds[move.code][label], qty]);
      }
      await client.query(
        `INSERT INTO stock_purchase_order_events (order_id, action, from_status, to_status, note, move_id, actor_name, created_at)
         VALUES ($1, 'verify', 'requested', 'received', $2, $3, $4, $5)`,
        [orderId, "ยกมาจากชีตข้อมูลบัญชี: รับของครบตามชีต", moveId, ACCOUNT_SHEET_ACTOR, order.when]
      );
      written.push({ orderId, supplier: order.supplier, currency, amount, when: order.when });
      orders += 1;
    }

    // Tie orders to the wallet payment that paid them: an "IOS Stock <supplier>" USDT payment
    // (fee left out) within 1 USDT of one order or of that supplier's orders of the day (the
    // sheets pay whole USDT, often once a day), at most 3 days apart. The payment points at the
    // day's first order; every order it covers records the payment.
    let linked = 0;
    const payments = (await client.query(
      `SELECT e.id, e.title, e.occurred_at, -(l.amount) - l.fee AS paid, l.wallet_id
         FROM stock_wallet_entries e JOIN stock_wallet_legs l ON l.entry_id = e.id
        WHERE e.kind = 'payment' AND e.order_id IS NULL AND l.currency = 'USDT' AND l.amount < 0 AND e.title ILIKE '%stock%'`
    )).rows;
    const used = new Set();
    const groups = new Map();
    for (const order of written.filter((entry) => entry.currency === "USDT")) {
      const key = `${order.supplier}|${order.when.slice(0, 10)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    }
    const covered = new Set();
    const pay = async (payment, orders) => {
      used.add(payment.id);
      await client.query(`UPDATE stock_wallet_entries SET order_id = $2 WHERE id = $1`, [payment.id, orders[0].orderId]);
      for (const order of orders) {
        covered.add(order.orderId);
        await client.query(`UPDATE stock_purchase_orders SET paid_wallet_id = $2, paid_at = $3 WHERE id = $1`, [order.orderId, payment.wallet_id, payment.occurred_at]);
      }
      linked += orders.length;
    };
    const find = (supplier, when, amount) => {
      const at = Date.parse(when);
      let best = null;
      for (const payment of payments) {
        if (used.has(payment.id) || !String(payment.title).toLowerCase().includes(supplier.toLowerCase())) continue;
        if (Math.abs(Number(payment.paid) - amount) >= 1) continue;
        const gap = Math.abs(Date.parse(payment.occurred_at) - at);
        if (gap <= 3 * DAY && (!best || gap < best.gap)) best = { payment, gap };
      }
      return best?.payment || null;
    };
    for (const orders of groups.values()) {
      for (const order of orders) {
        const payment = find(order.supplier, order.when, order.amount);
        if (payment) await pay(payment, [order]);
      }
      const left = orders.filter((order) => !covered.has(order.orderId));
      if (left.length > 1) {
        const payment = find(left[0].supplier, left[0].when, left.reduce((sum, order) => sum + order.amount, 0));
        if (payment) await pay(payment, left);
      }
    }
    await client.query("COMMIT");
    return { accounts: codes.size, orders, adjusts, linked, ordersRemoved: ordersRemoved.rowCount, movesRemoved: movesRemoved.rowCount, balances };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
