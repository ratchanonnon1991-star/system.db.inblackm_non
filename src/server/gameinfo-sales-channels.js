// Per-game sales channels (gameinfo-sales-channels.js in lib has the shape):
// one row per game and channel, in the gameinfo connection.
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecretByName } from "@/server/connections-repository";
import { recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";
import {
  GAMEINFO_SALES_CHANNELS,
  isEmptyGameinfoSalesChannel,
  sanitizeGameinfoSalesChannel,
} from "@/lib/gameinfo-sales-channels";

const CONNECTION_NAME = "gameinfo";
const schemaReadyByConnection = new Map();
const CHANNEL_ORDER = new Map(GAMEINFO_SALES_CHANNELS.map((channel, index) => [channel.key, index]));

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;
  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gamelist_sales_channels (
        game_id    INTEGER NOT NULL,
        channel    TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT '',
        market     TEXT NOT NULL DEFAULT '',
        margin     NUMERIC(8, 2),
        note       TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (game_id, channel)
      )
    `);
  })();
  promise.catch(() => schemaReadyByConnection.delete(connection.id));
  schemaReadyByConnection.set(connection.id, { cacheKey, promise });
  return promise;
}

async function getReadyPool() {
  const connection = await findConnectionWithSecretByName(CONNECTION_NAME);
  if (!connection) throw createHttpError(`ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}"`, 503);
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

function rowFromDb(row) {
  return sanitizeGameinfoSalesChannel({
    channel: row.channel,
    status: row.status,
    market: row.market,
    margin: row.margin == null ? null : Number(row.margin),
    note: row.note,
  });
}

function sortChannels(rows) {
  return rows.filter(Boolean).sort((a, b) => (CHANNEL_ORDER.get(a.channel) ?? 99) - (CHANNEL_ORDER.get(b.channel) ?? 99));
}

export async function listGamelistSalesChannels(gameId) {
  const pool = await getReadyPool();
  const result = await pool.query(`SELECT channel, status, market, margin, note FROM gamelist_sales_channels WHERE game_id = $1`, [gameId]);
  return sortChannels(result.rows.map(rowFromDb));
}

/** { [gameId]: Set of channels that already have a row } — what an import must not overwrite. */
export async function listGamelistSalesChannelKeysByGame() {
  const pool = await getReadyPool();
  const result = await pool.query(`SELECT game_id, channel FROM gamelist_sales_channels`);
  const byGame = {};
  for (const row of result.rows) (byGame[row.game_id] ||= new Set()).add(row.channel);
  return byGame;
}

/**
 * Writes the given channels for one game. `replace` (the editor) makes the
 * list the whole truth: channels left out or emptied are removed. Without it
 * (the sheet import) only the given channels are touched.
 */
export async function saveGamelistSalesChannels(gameId, channels, { actor = null, replace = false, source = "editor" } = {}) {
  if (!Array.isArray(channels)) throw createHttpError("รูปแบบช่องทางขายไม่ถูกต้อง", 400);
  const next = new Map();
  for (const input of channels) {
    const row = sanitizeGameinfoSalesChannel(input);
    if (row) next.set(row.channel, row);
  }
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const game = await client.query(`SELECT id FROM game_list WHERE id = $1 FOR UPDATE`, [gameId]);
    if (game.rows.length !== 1) throw createHttpError("ไม่พบเกม", 404);
    const before = sortChannels((await client.query(
      `SELECT channel, status, market, margin, note FROM gamelist_sales_channels WHERE game_id = $1`,
      [gameId]
    )).rows.map(rowFromDb));
    if (replace) {
      const keep = [...next.values()].filter((row) => !isEmptyGameinfoSalesChannel(row)).map((row) => row.channel);
      await client.query(`DELETE FROM gamelist_sales_channels WHERE game_id = $1 AND NOT (channel = ANY($2::text[]))`, [gameId, keep]);
    }
    for (const row of next.values()) {
      if (isEmptyGameinfoSalesChannel(row)) {
        await client.query(`DELETE FROM gamelist_sales_channels WHERE game_id = $1 AND channel = $2`, [gameId, row.channel]);
        continue;
      }
      await client.query(
        `INSERT INTO gamelist_sales_channels (game_id, channel, status, market, margin, note, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (game_id, channel) DO UPDATE SET
           status = EXCLUDED.status, market = EXCLUDED.market, margin = EXCLUDED.margin, note = EXCLUDED.note, updated_at = NOW()`,
        [gameId, row.channel, row.status, row.market, row.margin, row.note]
      );
    }
    const after = sortChannels((await client.query(
      `SELECT channel, status, market, margin, note FROM gamelist_sales_channels WHERE game_id = $1`,
      [gameId]
    )).rows.map(rowFromDb));
    await recordGameinfoAudit({ gameId, area: "sales-channels", actor, before, after, source: source === "import" ? "import" : "editor", client });
    await client.query("COMMIT");
    return after;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Part of deleting a game (gameinfo-gamelist.js), inside its transaction.
export async function deleteGamelistSalesChannelsForGame(gameId, client) {
  await getReadyPool(); // the table may not exist yet on a database that never used it
  await client.query(`DELETE FROM gamelist_sales_channels WHERE game_id = $1`, [gameId]);
}
