// One-off: imports the 48 games from the standalone gameinfo app's
// data/games.json (it was JSON-file backed, never SQL) into the "games"
// table of whatever Postgres connection is registered under the name
// "gameinfo" in this app's Connections admin UI. Safe to re-run — it
// refuses to touch a `games` table that already has rows.
//
// Usage:  node scripts/migrate-gameinfo.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import crypto from "node:crypto";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_JSON = "C:/Git/gameinfo/data/games.json";

function loadEnv() {
  const envPath = path.join(REPO_ROOT, ".env");
  let text;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Mirrors src/server/crypto.js's decryptSecret exactly — kept inline so this
// script has no "@/" alias dependency and can run with plain `node`.
function decryptSecret(payload) {
  const source =
    process.env.GAMEDB_ENC_KEY || process.env.SESSION_SECRET || process.env.OTP_SECRET;
  const key = crypto
    .createHash("sha256")
    .update(source || "gamedb-dev-secret")
    .digest();
  const [iv, tag, data] = String(payload || "").split(".");
  if (!iv || !tag || !data) throw new Error("รูปแบบรหัสผ่านที่เข้ารหัสไม่ถูกต้อง");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
    "utf8"
  );
}

async function main() {
  loadEnv();

  const mainPool = new pg.Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const { rows } = await mainPool.query(
    `SELECT host, port, database, username, password_enc, ssl
     FROM gamedb_connections WHERE LOWER(name) = 'gameinfo' LIMIT 1`
  );
  await mainPool.end();

  const conn = rows[0];
  if (!conn) {
    console.error(
      'ไม่พบ connection ชื่อ "gameinfo" — เพิ่มที่หน้า Connections ในเว็บก่อน แล้วค่อยรันสคริปต์นี้'
    );
    process.exit(1);
  }

  const gamePool = new pg.Pool({
    host: conn.host,
    port: conn.port,
    user: conn.username,
    password: conn.password_enc ? decryptSecret(conn.password_enc) : undefined,
    database: conn.database,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
  });

  await gamePool.query(`
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

  const existing = await gamePool.query(`SELECT COUNT(*)::int AS count FROM games`);
  if (existing.rows[0].count > 0) {
    console.log(
      `ตาราง games มีข้อมูลอยู่แล้ว ${existing.rows[0].count} แถว — ไม่ทำอะไร (ลบข้อมูลเองถ้าต้องการนำเข้าใหม่)`
    );
    await gamePool.end();
    return;
  }

  const games = JSON.parse(readFileSync(SOURCE_JSON, "utf8"));
  for (const g of games) {
    await gamePool.query(
      `INSERT INTO games
         (id, "order", game_name, region, vpn, web_topup, platform, server, image,
          currencies, computed_column, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, $12)`,
      [
        g.id,
        g.order ?? 0,
        g.gameName || "",
        g.region || "",
        g.vpn === "YES" ? "YES" : "NO",
        g.webTopup || "",
        g.platform || "",
        g.server || "",
        g.image || "",
        JSON.stringify(g.currencies || []),
        g.createdAt || new Date().toISOString(),
        g.updatedAt || new Date().toISOString(),
      ]
    );
  }

  // Explicit ids were inserted above, so the SERIAL sequence needs to catch
  // up or the next game created through the app will collide with one of these.
  await gamePool.query(
    `SELECT setval(pg_get_serial_sequence('games', 'id'), (SELECT COALESCE(MAX(id), 1) FROM games))`
  );

  console.log(`นำเข้าเกมสำเร็จ ${games.length} เกม`);
  await gamePool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
