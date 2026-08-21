import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const schemaReadyByConnection = new Map();

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find((connection) => connection.name.trim().toLowerCase() === CONNECTION_NAME);
  return match ? findConnectionWithSecret(match.id) : null;
}

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached?.cacheKey === cacheKey) return cached.promise;
  const promise = (async () => {
    const client = await getPoolForConnection(connection).connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_favorites (
          user_id    TEXT NOT NULL,
          game_id    INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, game_id)
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS gamelist_favorites_game_idx ON gamelist_favorites (game_id)`);
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
  if (!connection) throw createHttpError(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`, 503);
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

function normalizeUserId(userId) {
  const normalized = String(userId ?? "").trim().slice(0, 200);
  if (!normalized) throw createHttpError("ไม่พบบัญชีผู้ใช้", 401);
  return normalized;
}

export function normalizeGamelistFavorite(value) {
  if (typeof value !== "boolean") throw createHttpError("สถานะรายการโปรดไม่ถูกต้อง", 400);
  return value;
}

export async function listGamelistFavoriteIds(userId) {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(
      `SELECT game_id FROM gamelist_favorites WHERE user_id = $1 ORDER BY created_at DESC`,
      [normalizeUserId(userId)]
    );
    return result.rows.map((row) => Number(row.game_id));
  } finally {
    client.release();
  }
}

export async function setGamelistFavorite(userId, gameId, favorite) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedFavorite = normalizeGamelistFavorite(favorite);
  const client = await (await getReadyPool()).connect();
  try {
    if (!normalizedFavorite) {
      await client.query(`DELETE FROM gamelist_favorites WHERE user_id = $1 AND game_id = $2`, [normalizedUserId, gameId]);
      return false;
    }
    const game = await client.query(`SELECT id FROM game_list WHERE id = $1`, [gameId]);
    if (game.rows.length !== 1) throw createHttpError("ไม่พบเกมที่ต้องการเพิ่มในรายการโปรด", 404);
    await client.query(
      `INSERT INTO gamelist_favorites (user_id, game_id) VALUES ($1, $2) ON CONFLICT (user_id, game_id) DO NOTHING`,
      [normalizedUserId, gameId]
    );
    return true;
  } finally {
    client.release();
  }
}

export async function deleteGamelistFavoritesForGame(gameId, transactionClient = null) {
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_favorites WHERE game_id = $1`, [gameId]);
  } finally {
    if (!transactionClient) client.release();
  }
}
