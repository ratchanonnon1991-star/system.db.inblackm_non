import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const schemaReadyByConnection = new Map();
const MAX_IMAGE_VALUE_LENGTH = 6 * 1024 * 1024;

export const INITIAL_GAMEINFO_BOT_CHANNELS = [
  ["API", "Codashop Reseller", [["", ["Zepeto", "MLBB", "AFK Journey", "PGR", "Magic GoGo", "RB6", "Farlight", "Free Fire ID"]]]],
  ["API", "Ronshop", [["", ["Dragon Nest", "Marvel Rivals", "PUBG Mobile", "SuperSUS", "One Punch Man", "Hatsune Miku", "Speed Drifters", "Blood Strike"]]]],
  ["API", "Acorn 2H", [["", ["ZZZ", "Genshin", "Watcher of Realms"]]]],
  ["API", "Game Point", [["", ["MLBB JBR", "HoK", "Be the King", "Racing Master", "Crossfire", "Eggy Party", "LifeAfter SEA"]]]],
  ["API", "PLS Buy", [["", ["Stella Sora", "Azur Lane", "Tales of Survive", "Gangstar Mirage"]]]],
  ["BOT", "GoCash", [["", ["Sky", "MLA"]]]],
  ["BOT", "Multi Game Card", [["", ["Oxide", "Avakin"]]]],
  ["BOT", "Razer", [
    ["CAD", ["Avatar: Realms Collide", "Infinite Magicraid", "Cats: Crash Arena Turbo Stars", "Crusader Mobile", "Black Post", "UNDAWN", "Arena Breakout"]],
    ["SGD", ["Tokyo Ghoul", "Magic Man", "Samkok: New Force", "Legend of Angel", "ROO", "Ace of Em", "Kuroko Basketball", "Mungil: Star Dive", "Legend of Mushroom", "Drag Racing"]],
  ]],
  ["BOT", "Codashop", [
    ["MMK", ["Love Deep", "Honkai Impact 3", "Harry Potter: Magic Awakened", "Auto Chess", "Path to Nowhere", "Shining Nikki", "Dummy Land", "Heaven Burns Red", "8 Ball Pool"]],
    ["PHP", ["Top Eleven", "Honkai: Star Rail", "Stumble Guys"]],
    ["LAK", ["Dragon City", "Growtopia", "Tom and Jerry", "Nico"]],
    ["THB", ["World War Heroes"]],
  ]],
  ["BOT", "NetEase", [["", ["Where Winds Meet", "Sword of Justice", "Identity V", "Once Human", "Destiny: Rising"]]]],
].map(([category, channelName, currencies]) => ({
  category,
  channelName,
  imageUrl: "",
  currencies: currencies.map(([name, games]) => ({ name, games })),
}));

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

async function seedIfEmpty(client) {
  const result = await client.query("SELECT COUNT(*)::int AS count FROM gameinfo_bot_channels");
  if (Number(result.rows[0]?.count) !== 0) return;
  for (const [sortOrder, channel] of INITIAL_GAMEINFO_BOT_CHANNELS.entries()) {
    await client.query(
      `INSERT INTO gameinfo_bot_channels (category, channel_name, currencies, sort_order)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT DO NOTHING`,
      [channel.category, channel.channelName, JSON.stringify(channel.currencies), sortOrder]
    );
  }
}

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached?.cacheKey === cacheKey) return cached.promise;
  const promise = (async () => {
    const client = await getPoolForConnection(connection).connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gameinfo_bot_channels (
          id           BIGSERIAL PRIMARY KEY,
          category     VARCHAR(3) NOT NULL CHECK (category IN ('BOT', 'API')),
          channel_name TEXT NOT NULL CHECK (BTRIM(channel_name) <> ''),
          image_url    TEXT NOT NULL DEFAULT '',
          currencies   JSONB NOT NULL DEFAULT '[]'::jsonb,
          sort_order   INTEGER NOT NULL DEFAULT 0,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`ALTER TABLE gameinfo_bot_channels ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS gameinfo_bot_category_images (
          category   VARCHAR(3) PRIMARY KEY CHECK (category IN ('BOT', 'API')),
          image_url  TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS gameinfo_bot_channels_category_name
        ON gameinfo_bot_channels (category, LOWER(channel_name))
      `);
      await seedIfEmpty(client);
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

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeGameinfoBotChannel(value) {
  const category = cleanText(value?.category).toUpperCase();
  if (category !== "BOT" && category !== "API") throw createHttpError("หมวดหมู่ต้องเป็น BOT หรือ API", 400);
  const channelName = cleanText(value?.channelName);
  if (!channelName) throw createHttpError("กรุณาระบุชื่อช่องทาง", 400);
  const imageUrl = String(value?.imageUrl ?? "").trim();
  if (imageUrl.length > MAX_IMAGE_VALUE_LENGTH) throw createHttpError("รูปช่องทางมีขนาดใหญ่เกินไป", 400);
  if (imageUrl && !/^(https?:\/\/|data:image\/)/i.test(imageUrl)) throw createHttpError("รูปช่องทางต้องเป็น URL หรือไฟล์รูปภาพ", 400);
  if (!Array.isArray(value?.currencies) || !value.currencies.length) throw createHttpError("กรุณาเพิ่มสกุลเงินอย่างน้อย 1 รายการ", 400);

  const currencyNames = new Set();
  const currencies = value.currencies.map((currency) => {
    const name = cleanText(currency?.name);
    const currencyKey = name.toLocaleLowerCase("th");
    if (currencyNames.has(currencyKey)) throw createHttpError(`สกุลเงิน ${name || "ไม่ระบุ"} ซ้ำ`, 400);
    currencyNames.add(currencyKey);
    if (!Array.isArray(currency?.games) || !currency.games.length) throw createHttpError(`กรุณาเพิ่มชื่อเกมในสกุลเงิน ${name || "ไม่ระบุ"}`, 400);
    const gameNames = new Set();
    const games = currency.games.map((game) => {
      const normalized = cleanText(game);
      if (!normalized) throw createHttpError("ชื่อเกมห้ามว่าง", 400);
      const key = normalized.toLocaleLowerCase("th");
      if (gameNames.has(key)) throw createHttpError(`ชื่อเกม ${normalized} ซ้ำ`, 400);
      gameNames.add(key);
      return normalized;
    });
    return { name, games };
  });
  return { category, channelName, imageUrl, currencies };
}

function mapChannel(row) {
  return {
    id: Number(row.id),
    category: row.category,
    channelName: row.channel_name,
    imageUrl: row.image_url ?? "",
    currencies: Array.isArray(row.currencies) ? row.currencies : [],
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function translateUniqueError(error) {
  if (error?.code === "23505") throw createHttpError("มีชื่อช่องทางนี้อยู่แล้วในหมวดที่เลือก", 409);
  throw error;
}

export async function listGameinfoBotChannels() {
  const result = await (await getReadyPool()).query(
    `SELECT id, category, channel_name, image_url, currencies, sort_order, created_at, updated_at
     FROM gameinfo_bot_channels
     ORDER BY CASE category WHEN 'BOT' THEN 0 ELSE 1 END, sort_order, id`
  );
  return result.rows.map(mapChannel);
}

export async function listGameinfoBotCategoryImages() {
  const result = await (await getReadyPool()).query(
    `SELECT category, image_url FROM gameinfo_bot_category_images WHERE image_url <> ''`
  );
  return Object.fromEntries(result.rows.map((row) => [row.category, row.image_url]));
}

export async function getGameinfoBotChannel(id) {
  const result = await (await getReadyPool()).query(
    `SELECT id, category, channel_name, image_url, currencies, sort_order, created_at, updated_at
     FROM gameinfo_bot_channels WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? mapChannel(result.rows[0]) : null;
}

export async function createGameinfoBotChannel(value) {
  const channel = normalizeGameinfoBotChannel(value);
  try {
    const result = await (await getReadyPool()).query(
      `INSERT INTO gameinfo_bot_channels (category, channel_name, currencies, image_url, sort_order)
       VALUES ($1, $2, $3::jsonb, $4, COALESCE((SELECT MAX(sort_order) + 1 FROM gameinfo_bot_channels WHERE category = $1), 0))
       RETURNING id, category, channel_name, image_url, currencies, sort_order, created_at, updated_at`,
      [channel.category, channel.channelName, JSON.stringify(channel.currencies), channel.imageUrl]
    );
    return mapChannel(result.rows[0]);
  } catch (error) {
    translateUniqueError(error);
  }
}

export async function updateGameinfoBotChannel(id, value) {
  const channel = normalizeGameinfoBotChannel(value);
  try {
    const result = await (await getReadyPool()).query(
      `UPDATE gameinfo_bot_channels
       SET category = $2, channel_name = $3, currencies = $4::jsonb, image_url = $5, updated_at = NOW()
       WHERE id = $1
       RETURNING id, category, channel_name, image_url, currencies, sort_order, created_at, updated_at`,
      [id, channel.category, channel.channelName, JSON.stringify(channel.currencies), channel.imageUrl]
    );
    if (!result.rows[0]) throw createHttpError("ไม่พบช่องทางที่ต้องการแก้ไข", 404);
    return mapChannel(result.rows[0]);
  } catch (error) {
    translateUniqueError(error);
  }
}
