import pg from "pg";

const { Pool } = pg;

let pool;

/**
 * Separate pool pointing at the shared production DB (thatsky-main /
 * ManangementBackEnd) that owns sky_gocash_history / codashop_orders /
 * system_settings. Kept apart from the app's own getPool() in src/lib/db.js
 * on purpose: this app must never write to that database, only ever SELECT
 * from it, so it gets its own tightly-scoped connection instead of sharing
 * the general-purpose pool other features use for their own read/write DB.
 */
function getPool() {
  if (!pool) {
    if (!process.env.PROFIT_DATABASE_URL) {
      throw new Error("PROFIT_DATABASE_URL is not configured");
    }
    pool = new Pool({
      connectionString: process.env.PROFIT_DATABASE_URL,
      max: 3,
      ssl: false,
    });
    pool.on("error", (err) => {
      console.error("[profit-remote-db] pool error:", err.message);
    });
  }
  return pool;
}

export async function selectQuery(sql, params = []) {
  const { rows } = await getPool().query(sql, params);
  return rows;
}
