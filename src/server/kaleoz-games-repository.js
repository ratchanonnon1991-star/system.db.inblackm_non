import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const schemaReadyByConnection = new Map();

// Seeded once, the first time the table is created — after that the list lives
// entirely in the DB and is managed from the price-compare page.
export const DEFAULT_KALEOZ_GAMES = [
  { value: "zepeto", label: "ZEPETO", slug: "zepeto" },
  { value: "honkai-impact", label: "HONKAI IMPACT", slug: "honkai-impact-3-asia" },
  { value: "love-and-deepspace", label: "LOVE AND DEEPSPACE", slug: "love-and-deepspace" },
  { value: "harry-magic", label: "HARRY MAGIC", slug: "harry-potter-ma-netease" },
  { value: "the-division-resurgence", label: "The Division Resurgence", slug: "the-division-resurgence" },
  { value: "auto-chess", label: "AUTO CHESS", slug: "auto-chess-mobile-global" },
  { value: "gangstar-mirage-city", label: "Gangstar Mirage City", slug: "gangstar-mirage-city" },
  { value: "honkai-star-rail", label: "HONKAI STAR RAIL", slug: "honkai-star-rail" },
  { value: "zenless-zone-zero", label: "ZENLESS ZONE ZERO", slug: "zenless-zone-zero" },
  { value: "destiny-rising", label: "DESTINY:RISING", slug: "destiny-rising" },
  { value: "mobile-legends", label: "MOBILE LEGENDS", slug: "mobile-legends" },
  { value: "punishing-gray-raven", label: "PUNISHING GRAY RAVEN", slug: "punishing-gray-raven-global" },
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
        CREATE TABLE IF NOT EXISTS kaleoz_games (
          value      TEXT PRIMARY KEY,
          slug       TEXT NOT NULL UNIQUE,
          label      TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(
        `INSERT INTO kaleoz_games (value, slug, label, sort_order)
         SELECT seed.value, seed.slug, seed.label, seed.sort_order
         FROM jsonb_to_recordset($1::jsonb) AS seed(value TEXT, slug TEXT, label TEXT, sort_order INTEGER)
         ON CONFLICT DO NOTHING`,
        [JSON.stringify(DEFAULT_KALEOZ_GAMES.map((game, index) => ({ ...game, sort_order: index })))]
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

export function slugFromKaleozUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw createHttpError("กรุณาวางลิงก์หน้าเกมของ Kaleoz", 400);
  // Accept a full Kaleoz URL or a bare slug — only the slug is ever used.
  const slug = /^[a-z0-9][a-z0-9-]*$/i.test(raw)
    ? raw
    : /kaleoz\.com\/(?:[a-z-]+\/)?buy\/([a-z0-9-]+)/i.exec(raw)?.[1];
  if (!slug) throw createHttpError("ลิงก์ไม่ถูกต้อง ต้องเป็นลิงก์แบบ https://www.kaleoz.com/buy/<ชื่อเกม>", 400);
  return slug.toLocaleLowerCase("en");
}

function toGame(row) {
  return { value: row.value, slug: row.slug, label: row.label, createdAt: row.created_at?.toISOString?.() || null };
}

export async function listKaleozGames() {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`SELECT value, slug, label, created_at FROM kaleoz_games ORDER BY sort_order, label`);
    return result.rows.map(toGame);
  } finally {
    client.release();
  }
}

export async function addKaleozGame({ slug, label }) {
  const name = String(label ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw createHttpError("ไม่พบชื่อเกมจากหน้า Kaleoz", 400);
  if (name.length > 120) throw createHttpError("ชื่อเกมต้องยาวไม่เกิน 120 ตัวอักษร", 400);
  const client = await (await getReadyPool()).connect();
  try {
    const existing = await client.query(`SELECT value, slug, label, created_at FROM kaleoz_games WHERE slug = $1`, [slug]);
    if (existing.rows.length) throw createHttpError(`มีเกม "${existing.rows[0].label}" อยู่ในรายการแล้ว`, 409);
    const result = await client.query(
      `INSERT INTO kaleoz_games (value, slug, label, sort_order)
       VALUES ($1, $1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM kaleoz_games), 0))
       RETURNING value, slug, label, created_at`,
      [slug, name]
    );
    return toGame(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function deleteKaleozGame(value) {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`DELETE FROM kaleoz_games WHERE value = $1 RETURNING value, slug, label, created_at`, [value]);
    if (!result.rows.length) throw createHttpError("ไม่พบเกมที่ต้องการลบ", 404);
    return toGame(result.rows[0]);
  } finally {
    client.release();
  }
}
