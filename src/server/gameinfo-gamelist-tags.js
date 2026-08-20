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
        CREATE TABLE IF NOT EXISTS gamelist_tags (
          game_id    INTEGER PRIMARY KEY,
          data       JSONB NOT NULL DEFAULT '{"tags":[]}'::jsonb,
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
  if (!connection) throw createHttpError(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`, 503);
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

export function normalizeGamelistTags(tags) {
  if (!Array.isArray(tags)) throw createHttpError("รูปแบบ tags ไม่ถูกต้อง", 400);
  if (tags.length > 10) throw createHttpError("เพิ่ม tags ได้สูงสุด 10 รายการต่อเกม", 400);
  const seen = new Set();
  return tags.flatMap((value) => {
    const tag = String(value ?? "").trim().replace(/\s+/g, " ");
    if (tag.length > 60) throw createHttpError("tag ต้องยาวไม่เกิน 60 ตัวอักษร", 400);
    const key = tag.toLocaleLowerCase("th");
    if (!tag || seen.has(key)) return [];
    seen.add(key);
    return [tag];
  });
}

export async function getGamelistTags(gameId) {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`SELECT data FROM gamelist_tags WHERE game_id = $1`, [gameId]);
    return normalizeGamelistTags(result.rows[0]?.data?.tags ?? []);
  } finally {
    client.release();
  }
}

export async function listGamelistTagsByGame() {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`SELECT game_id, data FROM gamelist_tags`);
    return Object.fromEntries(result.rows.map((row) => [row.game_id, normalizeGamelistTags(row.data?.tags ?? [])]));
  } finally {
    client.release();
  }
}

export async function saveGamelistTags(gameId, tags) {
  const normalized = normalizeGamelistTags(tags);
  const client = await (await getReadyPool()).connect();
  try {
    await client.query("BEGIN");
    const game = await client.query(`SELECT id FROM game_list WHERE id = $1 FOR UPDATE`, [gameId]);
    if (game.rows.length !== 1) throw createHttpError("ไม่พบเกมที่ต้องการบันทึก tags", 404);
    if (normalized.length) {
      await client.query(
        `INSERT INTO gamelist_tags (game_id, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (game_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [gameId, JSON.stringify({ tags: normalized })]
      );
    } else {
      await client.query(`DELETE FROM gamelist_tags WHERE game_id = $1`, [gameId]);
    }
    await client.query("COMMIT");
    return normalized;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteGamelistTagsForGame(gameId) {
  const client = await (await getReadyPool()).connect();
  try {
    await client.query(`DELETE FROM gamelist_tags WHERE game_id = $1`, [gameId]);
  } finally {
    client.release();
  }
}
