import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Resolves the "gameinfo" row in gamedb_connections, or null if it hasn't
 * been configured yet (Settings → Connections). */
export async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find(
    (c) => c.name.trim().toLowerCase() === CONNECTION_NAME
  );
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

// Cached per connection id/updatedAt, same invalidation key as the pool cache
// in @/lib/db — editing the connection re-runs this once, not every request.
const schemaReadyByConnection = new Map();

function ensureGameinfoSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;

  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    const client = await pool.connect();
    try {
      // Safety net for a fresh/empty gameinfo database only — if `games`
      // already exists (ported from the original JSON-file app) this is a
      // no-op and the real, already-live shape wins.
      await client.query(`
        CREATE TABLE IF NOT EXISTS games (
          id              SERIAL PRIMARY KEY,
          "order"         INTEGER NOT NULL DEFAULT 0,
          game_name       TEXT NOT NULL DEFAULT '',
          region          TEXT NOT NULL DEFAULT '',
          vpn             TEXT NOT NULL DEFAULT 'NO' CHECK (vpn IN ('YES', 'NO')),
          web_topup       TEXT NOT NULL DEFAULT '',
          platform        TEXT NOT NULL DEFAULT '',
          server          TEXT NOT NULL DEFAULT '',
          image           TEXT NOT NULL DEFAULT '',
          currencies      JSONB NOT NULL DEFAULT '[]'::jsonb,
          computed_column JSONB,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  await ensureGameinfoSchema(connection);
  return getPoolForConnection(connection);
}

// `computed_column` stores an array — [{ key, label, formula, type }] — the
// same shape as a saved query's layout.computed[], so gamedb-formula.js works
// unmodified whichever side wrote it.
function mapRow(row) {
  return {
    id: row.id,
    order: row.order,
    gameName: row.game_name,
    region: row.region,
    vpn: row.vpn,
    webTopup: row.web_topup,
    platform: row.platform,
    server: row.server,
    image: row.image,
    currencies: row.currencies || [],
    computedColumns: Array.isArray(row.computed_column) ? row.computed_column : [],
  };
}

const FIELD_COLUMNS = {
  gameName: "game_name",
  region: "region",
  vpn: "vpn",
  webTopup: "web_topup",
  platform: "platform",
  server: "server",
  image: "image",
};

function normalizeFieldValue(field, value) {
  if (field === "vpn") return value === "YES" ? "YES" : "NO";
  return String(value ?? "");
}

/** Reads a single game (with its nested pack/currency JSON) from the shared
 * gameinfo Postgres connection, or null if that connection isn't configured
 * yet or the game doesn't exist. */
export async function getGameinfoGame(id) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT * FROM games WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  } finally {
    client.release();
  }
}

export async function listGameinfoGames() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT * FROM games ORDER BY "order" ASC, id ASC`);
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

export async function createGameinfoGame(fields) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const nextOrder = await client.query(
      `SELECT COALESCE(MAX("order"), 0) + 1 AS next FROM games`
    );
    const result = await client.query(
      `INSERT INTO games (game_name, region, vpn, web_topup, platform, server, image, "order")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        normalizeFieldValue("gameName", fields.gameName),
        normalizeFieldValue("region", fields.region),
        normalizeFieldValue("vpn", fields.vpn),
        normalizeFieldValue("webTopup", fields.webTopup),
        normalizeFieldValue("platform", fields.platform),
        normalizeFieldValue("server", fields.server),
        normalizeFieldValue("image", fields.image),
        nextOrder.rows[0].next,
      ]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function updateGameinfoGame(id, fields) {
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
  if (!sets.length) return getGameinfoGame(id);
  sets.push(`updated_at = NOW()`);
  values.push(id);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE games SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteGameinfoGame(id) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM games WHERE id = $1`, [id]);
  } finally {
    client.release();
  }
}

export async function reorderGameinfoGames(orderedIds) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let index = 0; index < orderedIds.length; index += 1) {
      await client.query(`UPDATE games SET "order" = $1 WHERE id = $2`, [
        index,
        orderedIds[index],
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveGameinfoPacks(id, { currencies, computedColumns }) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE games
       SET currencies = $1, computed_column = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [
        JSON.stringify(Array.isArray(currencies) ? currencies : []),
        JSON.stringify(Array.isArray(computedColumns) ? computedColumns : []),
        id,
      ]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}
