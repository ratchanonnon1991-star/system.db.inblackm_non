// One-off: the pack editor used to store its whole currency/category/pack
// tree in games.currencies (JSONB). That storage was replaced by a normalized
// game_packs table (game_id + pack_id as PK, the rest of the pack in a `data`
// JSON column) — see src/server/gameinfo-games.js. Games imported before that
// change (e.g. via scripts/migrate-gameinfo.mjs) still have their real pack
// data sitting in the old games.currencies column, invisible to the app now
// that reads go through game_packs. This backfills it across.
//
// Safe to re-run: a game is skipped if game_packs already has any row for it.
//
// Usage:  node scripts/backfill-game-packs.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import crypto from "node:crypto";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

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

// Mirrors flattenCurrencies() in src/server/gameinfo-games.js.
function flattenCurrencies(gameId, currencies) {
  const rows = [];
  (currencies || []).forEach((currency, currencyOrder) => {
    (currency.categories || []).forEach((category, categoryOrder) => {
      (category.packs || []).forEach((pack, packOrder) => {
        rows.push({
          packId: String(pack.id),
          gameId,
          data: {
            currencyId: currency.id,
            currencyName: currency.name || "",
            currencyImage: currency.image || "",
            currencyOrder,
            categoryId: category.id,
            categoryName: category.name || "",
            categoryOrder,
            packOrder,
            name: pack.name || "",
            image: pack.image || "",
            price: pack.price || "",
            amountCharged: pack.amountCharged || "",
            amountChargedFee: pack.amountChargedFee || "",
            channelsMain: Array.isArray(pack.channelsMain) ? pack.channelsMain : [],
            channelsSecondary: Array.isArray(pack.channelsSecondary)
              ? pack.channelsSecondary
              : [],
            country: pack.country || "",
          },
        });
      });
    });
  });
  return rows;
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
    console.error('ไม่พบ connection ชื่อ "gameinfo"');
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
    CREATE TABLE IF NOT EXISTS game_packs (
      game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      pack_id    TEXT NOT NULL,
      data       JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (game_id, pack_id)
    )
  `);

  const games = await gamePool.query(`SELECT id, currencies FROM games ORDER BY id`);
  let migrated = 0;
  let skippedHasRows = 0;
  let skippedEmpty = 0;

  for (const game of games.rows) {
    const already = await gamePool.query(
      `SELECT 1 FROM game_packs WHERE game_id = $1 LIMIT 1`,
      [game.id]
    );
    if (already.rows.length) {
      skippedHasRows += 1;
      continue;
    }
    const rows = flattenCurrencies(game.id, game.currencies);
    if (!rows.length) {
      skippedEmpty += 1;
      continue;
    }
    for (const r of rows) {
      await gamePool.query(
        `INSERT INTO game_packs (game_id, pack_id, data) VALUES ($1, $2, $3)
         ON CONFLICT (game_id, pack_id) DO NOTHING`,
        [r.gameId, r.packId, JSON.stringify(r.data)]
      );
    }
    migrated += 1;
    console.log(`  เกม ${game.id}: ย้าย ${rows.length} แพ็ก`);
  }

  console.log(
    `\nสำเร็จ: ย้ายแล้ว ${migrated} เกม · ข้าม ${skippedHasRows} เกม (มี game_packs อยู่แล้ว) · ${skippedEmpty} เกมไม่มี pack`
  );
  await gamePool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
