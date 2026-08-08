// Direct CRUD against Topup Panel's own `game_list` table (not the generic
// read-only Query/SQL runner) — reached through the same "gameinfo"
// connection already registered in Connections. Schema is Topup Panel's own
// and is left untouched (no ALTER TABLE): id, rank_stars, bot_manual,
// channel, region, vpn, game, is_repeatable, link, platform, server, remark,
// created_at, updated_at.
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";
import { deleteGamelistPacksForGame } from "@/server/gameinfo-gamelist-packs";
import { deleteGamelistTutorialForGame } from "@/server/gameinfo-gamelist-tutorial";

const CONNECTION_NAME = "gameinfo";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find((c) => c.name.trim().toLowerCase() === CONNECTION_NAME);
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

// game_list has no order column and isn't ours to ALTER (shared with Topup
// Panel) — display order for the drag-to-reorder UI lives in this small side
// table instead, one row per game that's ever been reordered/created through
// gameinfo. Games with no row here (e.g. already in game_list before this
// existed) just sort after the ordered ones, by id.
const schemaReadyByConnection = new Map();

function ensureOrderSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;

  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_order (
          game_id    INTEGER PRIMARY KEY,
          sort_order INTEGER NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    } finally {
      client.release();
    }
  })();
  promise.catch(() => schemaReadyByConnection.delete(connection.id));
  schemaReadyByConnection.set(connection.id, { cacheKey, promise });
  return promise;
}

async function getReadyPool() {
  const connection = await getGameinfoConnection();
  if (!connection) {
    throw createHttpError(
      `ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}" — เพิ่ม Connection ชื่อนี้ก่อนที่หน้า Connections`,
      503
    );
  }
  await ensureOrderSchema(connection);
  return getPoolForConnection(connection);
}

function mapRow(row) {
  return {
    id: row.id,
    sortOrder: row.sort_order ?? null,
    game: row.game,
    region: row.region,
    platform: row.platform || "",
    server: row.server || "",
    vpn: row.vpn,
    channel: row.channel,
    rankStars: row.rank_stars,
    botManual: row.bot_manual,
    isRepeatable: row.is_repeatable,
    link: row.link || "",
    remark: row.remark || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const FIELD_COLUMNS = {
  game: "game",
  region: "region",
  platform: "platform",
  server: "server",
  vpn: "vpn",
  channel: "channel",
  rankStars: "rank_stars",
  botManual: "bot_manual",
  isRepeatable: "is_repeatable",
  link: "link",
  remark: "remark",
};

function normalizeFieldValue(field, value) {
  if (field === "isRepeatable") return Boolean(value);
  if (field === "rankStars") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 0;
  }
  return String(value ?? "");
}

export async function listGameListRows() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT g.*, o.sort_order
      FROM game_list g
      LEFT JOIN gamelist_order o ON o.game_id = g.id
      ORDER BY (o.sort_order IS NULL), o.sort_order ASC, g.id ASC
    `);
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

/** Persists the dragged order — one row per game in `gamelist_order`,
 * upserted so games reordered for the first time get a row created. */
export async function reorderGameListRows(orderedIds) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let index = 0; index < orderedIds.length; index += 1) {
      await client.query(
        `INSERT INTO gamelist_order (game_id, sort_order, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (game_id) DO UPDATE SET sort_order = $2, updated_at = NOW()`,
        [orderedIds[index], index]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getGameListRow(id) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT * FROM game_list WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  } finally {
    client.release();
  }
}

export async function createGameListRow(fields) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO game_list (game, region, platform, server, vpn, channel, rank_stars, bot_manual, is_repeatable, link, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        normalizeFieldValue("game", fields.game),
        normalizeFieldValue("region", fields.region),
        fields.platform ? String(fields.platform) : null,
        fields.server ? String(fields.server) : null,
        normalizeFieldValue("vpn", fields.vpn || "NO VPN"),
        normalizeFieldValue("channel", fields.channel),
        normalizeFieldValue("rankStars", fields.rankStars),
        normalizeFieldValue("botManual", fields.botManual),
        normalizeFieldValue("isRepeatable", fields.isRepeatable),
        fields.link ? String(fields.link) : null,
        fields.remark ? String(fields.remark) : null,
      ]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function updateGameListRow(id, fields) {
  const pool = await getReadyPool();
  const sets = [];
  const values = [];
  let i = 1;
  for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
    if (fields[field] !== undefined) {
      sets.push(`${column} = $${i++}`);
      values.push(normalizeFieldValue(field, fields[field]));
    }
  }
  if (!sets.length) return getGameListRow(id);
  sets.push(`updated_at = NOW()`);
  values.push(id);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE game_list SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteGameListRow(id) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM game_list WHERE id = $1`, [id]);
    await client.query(`DELETE FROM gamelist_order WHERE game_id = $1`, [id]);
  } finally {
    client.release();
  }
  await deleteGamelistPacksForGame(id);
  await deleteGamelistTutorialForGame(id);
}
