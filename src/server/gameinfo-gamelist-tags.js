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
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_tag_catalog (
          tag_key    TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          image_url  TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_publishers (
          game_id    INTEGER PRIMARY KEY,
          data       JSONB NOT NULL DEFAULT '{"publishers":[]}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_publisher_catalog (
          publisher_key TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          image_url     TEXT NOT NULL DEFAULT '',
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

function normalizeLabels(values, label) {
  if (!Array.isArray(values)) throw createHttpError(`รูปแบบ ${label} ไม่ถูกต้อง`, 400);
  if (values.length > 10) throw createHttpError(`เพิ่ม ${label} ได้สูงสุด 10 รายการต่อเกม`, 400);
  const seen = new Set();
  return values.flatMap((value) => {
    const tag = String(value ?? "").trim().replace(/\s+/g, " ");
    if (tag.length > 60) throw createHttpError(`${label} ต้องยาวไม่เกิน 60 ตัวอักษร`, 400);
    const key = tag.toLocaleLowerCase("th");
    if (!tag || seen.has(key)) return [];
    seen.add(key);
    return [tag];
  });
}

export function normalizeGamelistTags(tags) {
  return normalizeLabels(tags, "tags");
}

export function normalizeGamelistPublishers(publishers) {
  return normalizeLabels(publishers, "ค่ายเกม");
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

export async function listGamelistTagImages() {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`SELECT name, image_url FROM gamelist_tag_catalog WHERE image_url <> ''`);
    return Object.fromEntries(result.rows.map((row) => [row.name, row.image_url]));
  } finally {
    client.release();
  }
}

export async function listGamelistPublishersByGame() {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`SELECT game_id, data FROM gamelist_publishers`);
    return Object.fromEntries(result.rows.map((row) => [row.game_id, normalizeGamelistPublishers(row.data?.publishers ?? [])]));
  } finally {
    client.release();
  }
}

export async function getGamelistPublishers(gameId) {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`SELECT data FROM gamelist_publishers WHERE game_id = $1`, [gameId]);
    return normalizeGamelistPublishers(result.rows[0]?.data?.publishers ?? []);
  } finally {
    client.release();
  }
}

export async function listGamelistPublisherImages() {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`SELECT name, image_url FROM gamelist_publisher_catalog WHERE image_url <> ''`);
    return Object.fromEntries(result.rows.map((row) => [row.name, row.image_url]));
  } finally {
    client.release();
  }
}

export async function saveGamelistTagImage(name, imageUrl) {
  const tag = normalizeGamelistTags([name])[0];
  if (!tag) throw createHttpError("กรุณาระบุชื่อ tag", 400);
  const tagKey = tag.toLocaleLowerCase("th");
  const normalizedImage = String(imageUrl ?? "").trim();
  const client = await (await getReadyPool()).connect();
  try {
    if (!normalizedImage) {
      await client.query(`DELETE FROM gamelist_tag_catalog WHERE tag_key = $1`, [tagKey]);
      return { name: tag, imageUrl: "" };
    }
    await client.query(
      `INSERT INTO gamelist_tag_catalog (tag_key, name, image_url, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tag_key) DO UPDATE
       SET name = EXCLUDED.name, image_url = EXCLUDED.image_url, updated_at = NOW()`,
      [tagKey, tag, normalizedImage]
    );
    return { name: tag, imageUrl: normalizedImage };
  } finally {
    client.release();
  }
}

export async function saveGamelistPublisherImage(name, imageUrl) {
  const publisher = normalizeGamelistPublishers([name])[0];
  if (!publisher) throw createHttpError("กรุณาระบุชื่อค่ายเกม", 400);
  const publisherKey = publisher.toLocaleLowerCase("th");
  const normalizedImage = String(imageUrl ?? "").trim();
  const client = await (await getReadyPool()).connect();
  try {
    if (!normalizedImage) {
      await client.query(`DELETE FROM gamelist_publisher_catalog WHERE publisher_key = $1`, [publisherKey]);
      return { name: publisher, imageUrl: "" };
    }
    await client.query(
      `INSERT INTO gamelist_publisher_catalog (publisher_key, name, image_url, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (publisher_key) DO UPDATE
       SET name = EXCLUDED.name, image_url = EXCLUDED.image_url, updated_at = NOW()`,
      [publisherKey, publisher, normalizedImage]
    );
    return { name: publisher, imageUrl: normalizedImage };
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

export async function saveGamelistPublishers(gameId, publishers) {
  const normalized = normalizeGamelistPublishers(publishers);
  const client = await (await getReadyPool()).connect();
  try {
    await client.query("BEGIN");
    const game = await client.query(`SELECT id FROM game_list WHERE id = $1 FOR UPDATE`, [gameId]);
    if (game.rows.length !== 1) throw createHttpError("ไม่พบเกมที่ต้องการบันทึกค่ายเกม", 404);
    if (normalized.length) {
      await client.query(
        `INSERT INTO gamelist_publishers (game_id, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (game_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [gameId, JSON.stringify({ publishers: normalized })]
      );
    } else {
      await client.query(`DELETE FROM gamelist_publishers WHERE game_id = $1`, [gameId]);
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

export async function deleteGamelistTagsForGame(gameId, transactionClient = null) {
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_tags WHERE game_id = $1`, [gameId]);
  } finally {
    if (!transactionClient) client.release();
  }
}

export async function deleteGamelistPublishersForGame(gameId, transactionClient = null) {
  const pool = await getReadyPool();
  const client = transactionClient || await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_publishers WHERE game_id = $1`, [gameId]);
  } finally {
    if (!transactionClient) client.release();
  }
}
