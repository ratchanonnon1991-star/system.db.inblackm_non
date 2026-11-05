// รอตัด: orders of games we hold stock for that have no stock cut yet.
// Orders are read (SELECT only) from telegram_orders_dev in the shared
// production DB; what was cut (stock_moves) and what a person marked
// "ไม่ได้ใช้ stock" (stock_order_skips) live in this app's own DB.
import { getPool } from "@/lib/db";
import { selectQuery } from "@/lib/profit-remote-db";
import { pendingStockOrders, stockOrderGamePatterns, stockPendingDays } from "@/lib/stock-pending-orders";
import { ensureStockSchema, listAwaitingStockMoves, listStockAccounts, listStockPackAliases } from "@/server/stock-repository";

const ORDER_LIMIT = 1000;
let skipsReady;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function ensureSkips() {
  if (skipsReady) return skipsReady;
  skipsReady = (async () => {
    await ensureStockSchema();
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS stock_order_skips (
        ref         VARCHAR(120) PRIMARY KEY,
        game_name   VARCHAR(160) NOT NULL DEFAULT '',
        pack_name   VARCHAR(200) NOT NULL DEFAULT '',
        actor_id    INTEGER,
        actor_name  VARCHAR(255) NOT NULL DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  })();
  skipsReady.catch(() => {
    skipsReady = null;
  });
  return skipsReady;
}

const cleanRef = (value) => String(value ?? "").trim().slice(0, 120);

/**
 * { orders, skipped, awaiting, accounts, days, error }: `orders` wait for a
 * cut, `skipped` were marked not-stock in the same window, `awaiting` are
 * cuts the system made that a person has not confirmed yet (each with the
 * order's current status when it is in the window). `error` is set (and the
 * order lists empty) when the order database cannot be read.
 */
export async function listPendingStockOrders({ days: rawDays, select = selectQuery } = {}) {
  await ensureSkips();
  const days = stockPendingDays(rawDays);
  const [accounts, aliases, awaitingMoves] = await Promise.all([listStockAccounts(), listStockPackAliases(), listAwaitingStockMoves()]);
  const open = accounts.filter((account) => account.status !== "closed");
  const patterns = stockOrderGamePatterns(open);
  const empty = { orders: [], skipped: [], awaiting: awaitingMoves, accounts: open, days };
  if (!patterns.length) return empty;

  let rows;
  try {
    rows = await select(
      `SELECT task_request_id, order_id, game_name, pack_name, price::text AS price, status, source, created_at
         FROM telegram_orders_dev
        WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
          AND game_name ILIKE ANY($2::text[])
        ORDER BY created_at DESC
        LIMIT ${ORDER_LIMIT}`,
      [days, patterns]
    );
  } catch (error) {
    console.error(error);
    return { ...empty, error: "อ่านออเดอร์จากฐานข้อมูลหลักไม่ได้ ลองใหม่อีกครั้ง" };
  }

  const refs = [...new Set(rows.flatMap((row) => [cleanRef(row.task_request_id), cleanRef(row.order_id)]).filter(Boolean))];
  const [cut, skips] = refs.length
    ? await Promise.all([
        getPool().query(`SELECT DISTINCT queue FROM stock_moves WHERE kind = 'out' AND queue = ANY($1::text[])`, [refs]),
        getPool().query(`SELECT ref, actor_name, created_at FROM stock_order_skips WHERE ref = ANY($1::text[])`, [refs]),
      ])
    : [{ rows: [] }, { rows: [] }];
  const skipBy = new Map(skips.rows.map((row) => [row.ref, row]));
  const done = new Set([...cut.rows.map((row) => row.queue), ...skipBy.keys()]);

  const orders = pendingStockOrders(rows, open, done, aliases);
  // The skipped ones, listed the same way so they can be put back.
  const cutRefs = new Set(cut.rows.map((row) => row.queue));
  const skipped = pendingStockOrders(rows.filter((row) => skipBy.has(cleanRef(row.task_request_id))), open, cutRefs, aliases)
    .map((order) => ({ ...order, skippedBy: skipBy.get(order.ref)?.actor_name || "", skippedAt: skipBy.get(order.ref)?.created_at || null }));
  // An order rejected after the system cut it should not stay cut.
  const statusOf = new Map(rows.map((row) => [cleanRef(row.task_request_id), String(row.status ?? "").trim()]));
  const awaiting = awaitingMoves.map((move) => ({ ...move, orderStatus: statusOf.get(move.queue) ?? null }));
  return { orders, skipped, awaiting, accounts: open, days, truncated: rows.length >= ORDER_LIMIT };
}

/** Mark an order "ไม่ได้ใช้ stock" so it leaves รอตัด. */
export async function skipStockOrder({ ref, game, pack }, actor = null) {
  await ensureSkips();
  const key = cleanRef(ref);
  if (!key) throw createHttpError("ไม่มีเลขคิว", 400);
  await getPool().query(
    `INSERT INTO stock_order_skips (ref, game_name, pack_name, actor_id, actor_name) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ref) DO NOTHING`,
    [key, String(game || "").slice(0, 160), String(pack || "").slice(0, 200), actor?.id ?? null, String(actor?.name || "").slice(0, 255)]
  );
}

/** Put a skipped order back on รอตัด. */
export async function unskipStockOrder(ref) {
  await ensureSkips();
  const key = cleanRef(ref);
  if (!key) throw createHttpError("ไม่มีเลขคิว", 400);
  await getPool().query(`DELETE FROM stock_order_skips WHERE ref = $1`, [key]);
}
