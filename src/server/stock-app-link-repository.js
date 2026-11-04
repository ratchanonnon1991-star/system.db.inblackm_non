import { getPool } from "@/lib/db";
import { bangkokToday, stockAppLinkDaysLeft, stockAppLinkTone, validateStockAppLink } from "@/lib/stock-app-links";

// Install links for the top-up apps with their expiry (src/lib/stock-app-links.js).

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS stock_app_links (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(120) NOT NULL,
        url         TEXT NOT NULL,
        expires_on  DATE NOT NULL,
        note        VARCHAR(300) NOT NULL DEFAULT '',
        actor_name  VARCHAR(255) NOT NULL DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    schemaReady.catch(() => {
      schemaReady = null;
    });
  }
  return schemaReady;
}

function mapLink(row, today) {
  const expiresOn = row.expires_on instanceof Date ? row.expires_on.toISOString().slice(0, 10) : String(row.expires_on).slice(0, 10);
  const daysLeft = stockAppLinkDaysLeft(expiresOn, today);
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    expiresOn,
    note: row.note,
    daysLeft,
    tone: stockAppLinkTone(daysLeft),
    actorName: row.actor_name,
    updatedAt: row.updated_at,
  };
}

/** Links soonest to expire first. */
export async function listStockAppLinks() {
  await ensureSchema();
  const result = await getPool().query(`SELECT id, name, url, to_char(expires_on, 'YYYY-MM-DD') AS expires_on, note, actor_name, updated_at FROM stock_app_links ORDER BY expires_on, id`);
  const today = bangkokToday();
  return result.rows.map((row) => mapLink(row, today));
}

export async function saveStockAppLink(id, input, actor = null) {
  await ensureSchema();
  const checked = validateStockAppLink(input);
  if (checked.error) throw createHttpError(checked.error, 400);
  const { link } = checked;
  const actorName = String(actor?.name || "").slice(0, 255);
  const result = id
    ? await getPool().query(
      `UPDATE stock_app_links SET name = $2, url = $3, expires_on = $4, note = $5, actor_name = $6, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [Number(id), link.name, link.url, link.expiresOn, link.note, actorName]
    )
    : await getPool().query(
      `INSERT INTO stock_app_links (name, url, expires_on, note, actor_name) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [link.name, link.url, link.expiresOn, link.note, actorName]
    );
  if (!result.rows[0]) throw createHttpError("ไม่พบลิงก์นี้", 404);
  return result.rows[0].id;
}

export async function deleteStockAppLink(id) {
  await ensureSchema();
  const result = await getPool().query(`DELETE FROM stock_app_links WHERE id = $1 RETURNING id`, [Number(id)]);
  if (!result.rows[0]) throw createHttpError("ไม่พบลิงก์นี้", 404);
  return result.rows[0].id;
}
