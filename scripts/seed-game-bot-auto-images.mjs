import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const repoRoot = path.resolve(import.meta.dirname, "..");
const imageDir = process.argv[2];

if (!imageDir) {
  console.error('Usage: node scripts/seed-game-bot-auto-images.mjs "C:/path/to/images"');
  process.exit(1);
}

for (const line of readFileSync(path.join(repoRoot, ".env"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index < 0) continue;
  const key = trimmed.slice(0, index).trim();
  if (process.env[key] === undefined) process.env[key] = trimmed.slice(index + 1).trim();
}

function decryptSecret(payload) {
  const source = process.env.GAMEDB_ENC_KEY || process.env.SESSION_SECRET || process.env.OTP_SECRET;
  const key = crypto.createHash("sha256").update(source || "gamedb-dev-secret").digest();
  const [iv, tag, data] = String(payload || "").split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

function pngDataUrl(filename) {
  return `data:image/png;base64,${readFileSync(path.join(imageDir, filename)).toString("base64")}`;
}

const categoryImages = [
  ["BOT", "Artboard 1 (2).png"],
  ["API", "Artboard 2.png"],
];
const channelImages = [
  ["API", "Codashop Reseller", "Artboard 3.png"],
  ["API", "Ronshop", "Artboard 9.png"],
  ["API", "Acorn 2H", "Artboard 10.png"],
  ["API", "Game Point", "Artboard 11.png"],
  ["API", "PLS Buy", "Artboard 8.png"],
  ["BOT", "GoCash", "Artboard 5.png"],
  ["BOT", "Multi Game Card", "Artboard 6 (2).png"],
  ["BOT", "Razer", "Artboard 7.png"],
  ["BOT", "Codashop", "Artboard 3.png"],
  ["BOT", "NetEase", "Artboard 4.png"],
];

const mainPool = new pg.Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
const connectionResult = await mainPool.query(
  `SELECT host, port, database, username, password_enc, ssl
   FROM gamedb_connections WHERE LOWER(name) = 'gameinfo' LIMIT 1`
);
await mainPool.end();
const connection = connectionResult.rows[0];
if (!connection) throw new Error('ไม่พบ connection ชื่อ "gameinfo"');

const gamePool = new pg.Pool({
  host: connection.host,
  port: connection.port,
  user: connection.username,
  password: connection.password_enc ? decryptSecret(connection.password_enc) : undefined,
  database: connection.database,
  ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
});
const client = await gamePool.connect();
try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TABLE IF NOT EXISTS gameinfo_bot_category_images (
      category VARCHAR(3) PRIMARY KEY CHECK (category IN ('BOT', 'API')),
      image_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const [category, filename] of categoryImages) {
    await client.query(
      `INSERT INTO gameinfo_bot_category_images (category, image_url, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (category) DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = NOW()`,
      [category, pngDataUrl(filename)]
    );
  }
  for (const [category, channelName, filename] of channelImages) {
    const result = await client.query(
      `UPDATE gameinfo_bot_channels SET image_url = $3, updated_at = NOW()
       WHERE category = $1 AND LOWER(channel_name) = LOWER($2)`,
      [category, channelName, pngDataUrl(filename)]
    );
    if (result.rowCount !== 1) throw new Error(`ไม่พบช่องทาง ${category} / ${channelName}`);
  }
  await client.query("COMMIT");
  console.log("บันทึกรูป BOT/API 2 รูป และช่องทาง 10 รายการลงฐานข้อมูลแล้ว");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await gamePool.end();
}
