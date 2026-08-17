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
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;
  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_links (
          game_id    INTEGER PRIMARY KEY,
          data       JSONB NOT NULL DEFAULT '{"links":[]}'::jsonb,
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

function normalizeLink(link, index) {
  const name = String(link?.name ?? "").trim().slice(0, 100);
  const url = String(link?.url ?? "").trim().slice(0, 2000);
  if (!name || !url) throw createHttpError(`ลิงก์ลำดับที่ ${index + 1} ต้องมีชื่อและ URL`, 400);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw createHttpError(`URL ของลิงก์ "${name}" ไม่ถูกต้อง`, 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createHttpError(`ลิงก์ "${name}" ต้องใช้ http:// หรือ https://`, 400);
  }
  return {
    id: String(link?.id || `link_${index + 1}`).slice(0, 100),
    name,
    url: parsed.toString(),
  };
}

export function normalizeGamelistLinks(links) {
  if (!Array.isArray(links)) throw createHttpError("รูปแบบรายการลิงก์ไม่ถูกต้อง", 400);
  if (links.length > 20) throw createHttpError("เพิ่มลิงก์ได้สูงสุด 20 รายการต่อเกม", 400);
  return links.map(normalizeLink);
}

export function legacyGamelistLinks(link) {
  const url = String(link || "").trim();
  if (!url) return [];
  try {
    return normalizeGamelistLinks([{ id: "legacy", name: "เว็บเติมเกม", url }]);
  } catch {
    return [];
  }
}

export async function getGamelistLinks(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT data FROM gamelist_links WHERE game_id = $1`, [gameId]);
    if (!result.rows[0]) return { exists: false, links: [] };
    return { exists: true, links: normalizeGamelistLinks(result.rows[0].data?.links ?? []) };
  } finally {
    client.release();
  }
}

export async function listGamelistLinksByGame() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT game_id, data FROM gamelist_links`);
    return Object.fromEntries(
      result.rows.map((row) => [row.game_id, normalizeGamelistLinks(row.data?.links ?? [])])
    );
  } finally {
    client.release();
  }
}

export async function saveGamelistLinks(gameId, links) {
  const normalized = normalizeGamelistLinks(links);
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const game = await client.query(`SELECT id FROM game_list WHERE id = $1 FOR UPDATE`, [gameId]);
    if (game.rows.length !== 1) throw createHttpError("ไม่พบเกมที่ต้องการบันทึกลิงก์", 404);
    await client.query(
      `INSERT INTO gamelist_links (game_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (game_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [gameId, JSON.stringify({ links: normalized })]
    );
    await client.query("COMMIT");
    return normalized;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteGamelistLinksForGame(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_links WHERE game_id = $1`, [gameId]);
  } finally {
    client.release();
  }
}
