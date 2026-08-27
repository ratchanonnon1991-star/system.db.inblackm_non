import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const schemaReadyByConnection = new Map();

// Seeded once, the first time the table is created — after that the list lives
// entirely in the DB and is managed from the price-compare page, same as Kaleoz.
export const DEFAULT_ITEMKU_GAMES = [
  { value: "zepeto", slug: "zepeto", label: "ZEPETO" },
  { value: "honkai-impact-3", slug: "honkai-impact-3", label: "HONKAI IMPACT" },
  { value: "love-and-deepspace", slug: "love-and-deepspace", label: "LOVE AND DEEPSPACE" },
  { value: "harry-potter-magic-awakened", slug: "harry-potter-magic-awakened", label: "HARRY MAGIC" },
];

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
        CREATE TABLE IF NOT EXISTS itemku_games (
          value      TEXT PRIMARY KEY,
          slug       TEXT NOT NULL UNIQUE,
          label      TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(
        `INSERT INTO itemku_games (value, slug, label, sort_order)
         SELECT seed.value, seed.slug, seed.label, seed.sort_order
         FROM jsonb_to_recordset($1::jsonb) AS seed(value TEXT, slug TEXT, label TEXT, sort_order INTEGER)
         ON CONFLICT DO NOTHING`,
        [JSON.stringify(DEFAULT_ITEMKU_GAMES.map((game, index) => ({ ...game, sort_order: index })))]
      );
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

export function slugFromItemkuUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw createHttpError("กรุณาวางลิงก์หน้าเกมของ itemku", 400);
  // Accept a full itemku URL or a bare slug — only the slug is ever used.
  const slug = /^[a-z0-9][a-z0-9-]*$/i.test(raw)
    ? raw
    : /itemku\.com\/(?:[a-z-]+\/)?g\/([a-z0-9-]+)/i.exec(raw)?.[1];
  if (!slug) throw createHttpError("ลิงก์ไม่ถูกต้อง ต้องเป็นลิงก์แบบ https://www.itemku.com/en/g/<ชื่อเกม>/top-up", 400);
  return slug.toLocaleLowerCase("en");
}

function toGame(row) {
  return {
    value: row.value,
    slug: row.slug,
    label: row.label,
    createdAt: row.created_at?.toISOString?.() || null,
  };
}

export async function listItemkuGames() {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`SELECT value, slug, label, created_at FROM itemku_games ORDER BY sort_order, label`);
    return result.rows.map(toGame);
  } finally {
    client.release();
  }
}

export async function addItemkuGame({ slug, label }) {
  const name = String(label ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw createHttpError("ไม่พบชื่อเกมจากหน้า itemku", 400);
  if (name.length > 120) throw createHttpError("ชื่อเกมต้องยาวไม่เกิน 120 ตัวอักษร", 400);
  const client = await (await getReadyPool()).connect();
  try {
    const existing = await client.query(`SELECT value, slug, label, created_at FROM itemku_games WHERE slug = $1`, [slug]);
    if (existing.rows.length) throw createHttpError(`มีเกม "${existing.rows[0].label}" อยู่ในรายการแล้ว`, 409);
    const result = await client.query(
      `INSERT INTO itemku_games (value, slug, label, sort_order)
       VALUES ($1, $1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM itemku_games), 0))
       RETURNING value, slug, label, created_at`,
      [slug, name]
    );
    return toGame(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function deleteItemkuGame(value) {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`DELETE FROM itemku_games WHERE value = $1 RETURNING value, slug, label, created_at`, [value]);
    if (!result.rows.length) throw createHttpError("ไม่พบเกมที่ต้องการลบ", 404);
    return toGame(result.rows[0]);
  } finally {
    client.release();
  }
}
