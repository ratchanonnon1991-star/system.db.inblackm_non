// Per-game "icon/cover" image for a game_list row — one game_id -> one image
// URL (or a base64 data: URL for an uploaded file, see
// gameinfo-image-picker-modal.js), same "not ours to ALTER game_list, keep a
// side table" shape as gamelist_packs/gamelist_tutorials. This is the game's
// own icon, deliberately separate from any pack/currency image — see the
// comment on RowThumb in gameinfo-gamelist-table.js for why those were never
// a safe stand-in for it.
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

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

const schemaReadyByConnection = new Map();

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;

  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_images (
          game_id    INTEGER PRIMARY KEY,
          image_url  TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

/** "" if never set. */
export async function getGamelistImage(gameId, transactionClient = null) {
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  try {
    const result = await client.query(
      `SELECT image_url FROM gamelist_images WHERE game_id = $1`,
      [gameId]
    );
    return { imageUrl: result.rows[0]?.image_url ?? "" };
  } finally {
    if (!transactionClient) client.release();
  }
}

/** Upserts, or deletes the row entirely when cleared back to "". */
export async function saveGamelistImage(gameId, imageUrl, transactionClient = null) {
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  try {
    const normalized = String(imageUrl ?? "").trim();
    if (!normalized) {
      await client.query(`DELETE FROM gamelist_images WHERE game_id = $1`, [gameId]);
      return { imageUrl: "" };
    }
    await client.query(
      `INSERT INTO gamelist_images (game_id, image_url, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (game_id) DO UPDATE SET image_url = $2, updated_at = NOW()`,
      [gameId, normalized]
    );
    return { imageUrl: normalized };
  } finally {
    if (!transactionClient) client.release();
  }
}

/** Cleanup hook for deleteGameListRow() — game_list isn't ours to put an FK
 * CASCADE on, same as deleteGamelistPacksForGame()/deleteGamelistTutorialForGame(). */
export async function deleteGamelistImageForGame(gameId, transactionClient = null) {
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_images WHERE game_id = $1`, [gameId]);
  } finally {
    if (!transactionClient) client.release();
  }
}

/** { [gameId]: imageUrl } for every game that has one set — one query for
 * the whole list table instead of one per row. */
export async function listGamelistImageByGame() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT game_id, image_url FROM gamelist_images`);
    const out = {};
    for (const row of result.rows) {
      if (row.image_url) out[row.game_id] = row.image_url;
    }
    return out;
  } finally {
    client.release();
  }
}
