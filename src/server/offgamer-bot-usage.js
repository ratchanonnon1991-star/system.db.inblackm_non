import { selectQuery } from "@/lib/profit-remote-db";
import { molPoints } from "@/lib/offgamer-cards";

// Where the OffGamer cards went: the Oxide bot pays Codashop orders with them and keeps the
// card's Serial in codashop_orders.phone_number, MOL's capture in provider_response. Read with
// SELECT only from the bot's database (PROFIT_DATABASE_URL); nothing is written there, and only
// serial, game, pack, time and points are read (no PIN or customer details).

/**
 * serials → { bySerial: { serial: { orders, points, first, last } }, error }. Only completed
 * orders count. `error` is a Thai message when the bot's database cannot be read.
 */
export async function offgamerBotUsage(serials, { select = selectQuery } = {}) {
  const list = [...new Set(serials.filter(Boolean))];
  if (!list.length) return { bySerial: {}, error: "" };
  try {
    const rows = await select(
      `SELECT c.phone_number AS serial, COUNT(*)::int AS orders, MIN(c.created_at) AS first, MAX(c.created_at) AS last,
              array_agg(btrim(c.provider_response->'payment'->'molGameCard'->>'redeemPoints')) AS points
         FROM codashop_orders c
        WHERE c.status = 'completed' AND c.phone_number = ANY($1::text[])
        GROUP BY c.phone_number`,
      [list]
    );
    const bySerial = {};
    for (const row of rows) {
      const points = (row.points || []).map(molPoints);
      bySerial[row.serial] = {
        orders: row.orders,
        // Unknown when any capture is unreadable: never counted as zero.
        points: points.some((value) => value === null) ? null : Math.round(points.reduce((sum, value) => sum + value, 0) * 100) / 100,
        first: row.first ? new Date(row.first).toISOString() : null,
        last: row.last ? new Date(row.last).toISOString() : null,
      };
    }
    return { bySerial, error: "" };
  } catch (error) {
    console.error("[offgamer-bot-usage]", error.message);
    return { bySerial: {}, error: "อ่านข้อมูลบอท Oxide ไม่ได้ตอนนี้ (ฐานข้อมูลบอทไม่ตอบ)" };
  }
}

/** One card's completed bot orders, newest first (at most 300). */
export async function offgamerBotOrders(serial, { select = selectQuery } = {}) {
  try {
    const rows = await select(
      `SELECT c.id, c.source_order_id, c.source, c.game_name, c.pack_name, c.created_at,
              btrim(c.provider_response->'payment'->'molGameCard'->>'redeemPoints') AS points,
              btrim(c.provider_response->'payment'->'molGameCard'->>'remainingBalance') AS remaining
         FROM codashop_orders c
        WHERE c.status = 'completed' AND c.phone_number = $1
        ORDER BY c.created_at DESC, c.id DESC LIMIT 300`,
      [String(serial)]
    );
    return {
      orders: rows.map((row) => ({
        id: row.id, sourceOrderId: row.source_order_id || "", source: row.source || "", game: row.game_name || "", pack: row.pack_name || "",
        at: row.created_at ? new Date(row.created_at).toISOString() : null, points: molPoints(row.points), remaining: molPoints(row.remaining),
      })),
      error: "",
    };
  } catch (error) {
    console.error("[offgamer-bot-usage]", error.message);
    return { orders: [], error: "อ่านออเดอร์ของบอท Oxide ไม่ได้ตอนนี้" };
  }
}
