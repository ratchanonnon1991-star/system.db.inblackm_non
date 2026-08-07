import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";
import { mergeCurrencies } from "@/lib/gameinfo-import";

const CONNECTION_NAME = "gameinfo";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Resolves the "gameinfo" row in gamedb_connections, or null if it hasn't
 * been configured yet (Settings → Connections). */
export async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find(
    (c) => c.name.trim().toLowerCase() === CONNECTION_NAME
  );
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

// Cached per connection id/updatedAt, same invalidation key as the pool cache
// in @/lib/db — editing the connection re-runs this once, not every request.
const schemaReadyByConnection = new Map();

function ensureGameinfoSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;

  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    const client = await pool.connect();
    try {
      // Safety net for a fresh/empty gameinfo database only — if `games`
      // already exists (ported from the original JSON-file app) this is a
      // no-op and the real, already-live shape wins.
      await client.query(`
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
      // One row per pack: game_id links to pack_id, everything else about the
      // pack (which currency/category it's under, name, price, images,
      // channels...) lives in `data`. Replaces the old games.currencies blob,
      // which is left in place unused rather than dropped.
      await client.query(`
        CREATE TABLE IF NOT EXISTS game_packs (
          game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          pack_id    TEXT NOT NULL,
          data       JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (game_id, pack_id)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS game_packs_game_id_idx ON game_packs (game_id)
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
  if (!connection) {
    throw createHttpError(
      `ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}" — เพิ่ม Connection ชื่อนี้ก่อนที่หน้า Connections`,
      503
    );
  }
  await ensureGameinfoSchema(connection);
  return getPoolForConnection(connection);
}

// --- currencies[] (UI shape) <-> game_packs rows (storage shape) ----------

/** One flat row per pack -> the nested currency/category/pack tree the UI
 * (GameinfoGameView, GameinfoPackEditor, GameinfoGameList) already expects.
 * Keeping that shape here means none of that UI had to change for the move
 * out of games.currencies. */
export function reconstructCurrencies(packRows) {
  const currencies = new Map();
  for (const { pack_id: packId, data } of packRows) {
    const d = data || {};
    if (!currencies.has(d.currencyId)) {
      currencies.set(d.currencyId, {
        id: d.currencyId,
        name: d.currencyName || "",
        image: d.currencyImage || "",
        order: d.currencyOrder ?? 0,
        categories: new Map(),
      });
    }
    const currency = currencies.get(d.currencyId);
    if (!currency.categories.has(d.categoryId)) {
      currency.categories.set(d.categoryId, {
        id: d.categoryId,
        name: d.categoryName || "",
        order: d.categoryOrder ?? 0,
        packs: [],
      });
    }
    currency.categories.get(d.categoryId).packs.push({
      id: packId,
      order: d.packOrder ?? 0,
      name: d.name || "",
      image: d.image || "",
      price: d.price || "",
      amountCharged: d.amountCharged || "",
      amountChargedFee: d.amountChargedFee || "",
      channelsMain: Array.isArray(d.channelsMain) ? d.channelsMain : [],
      channelsSecondary: Array.isArray(d.channelsSecondary) ? d.channelsSecondary : [],
      country: d.country || "",
    });
  }
  return [...currencies.values()]
    .sort((a, b) => a.order - b.order)
    .map((currency) => ({
      id: currency.id,
      name: currency.name,
      image: currency.image,
      categories: [...currency.categories.values()]
        .sort((a, b) => a.order - b.order)
        .map((category) => ({
          id: category.id,
          name: category.name,
          packs: category.packs
            .sort((a, b) => a.order - b.order)
            .map(({ order, ...pack }) => pack),
        })),
    }));
}

/** The nested UI tree -> one { packId, gameId, data } per pack, ready to
 * insert. Currency/category grouping and display order are carried inside
 * `data` (packOrder/categoryOrder/currencyOrder) since there's no separate
 * currency/category table. */
export function flattenCurrencies(gameId, currencies) {
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

async function fetchPacksForGames(client, gameIds) {
  if (!gameIds.length) return new Map();
  const result = await client.query(
    `SELECT game_id, pack_id, data FROM game_packs WHERE game_id = ANY($1::int[])`,
    [gameIds]
  );
  const byGame = new Map();
  for (const row of result.rows) {
    if (!byGame.has(row.game_id)) byGame.set(row.game_id, []);
    byGame.get(row.game_id).push(row);
  }
  return byGame;
}

// `computed_column` stores an array — [{ key, label, formula, type }] — the
// same shape as a saved query's layout.computed[], so gamedb-formula.js works
// unmodified whichever side wrote it.
function mapRow(row, packRows = []) {
  return {
    id: row.id,
    order: row.order,
    gameName: row.game_name,
    region: row.region,
    vpn: row.vpn,
    webTopup: row.web_topup,
    platform: row.platform,
    server: row.server,
    image: row.image,
    currencies: reconstructCurrencies(packRows),
    computedColumns: Array.isArray(row.computed_column) ? row.computed_column : [],
  };
}

const FIELD_COLUMNS = {
  gameName: "game_name",
  region: "region",
  vpn: "vpn",
  webTopup: "web_topup",
  platform: "platform",
  server: "server",
  image: "image",
};

function normalizeFieldValue(field, value) {
  if (field === "vpn") return value === "YES" ? "YES" : "NO";
  return String(value ?? "");
}

/** Reads a single game (with its nested pack/currency tree, reconstructed
 * from game_packs) from the shared gameinfo Postgres connection, or null if
 * that connection isn't configured yet or the game doesn't exist. */
export async function getGameinfoGame(id) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT * FROM games WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;
    const packsResult = await client.query(
      `SELECT game_id, pack_id, data FROM game_packs WHERE game_id = $1`,
      [id]
    );
    return mapRow(row, packsResult.rows);
  } finally {
    client.release();
  }
}

export async function listGameinfoGames() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const gamesResult = await client.query(`SELECT * FROM games ORDER BY "order" ASC, id ASC`);
    const packsByGame = await fetchPacksForGames(
      client,
      gamesResult.rows.map((row) => row.id)
    );
    return gamesResult.rows.map((row) => mapRow(row, packsByGame.get(row.id) || []));
  } finally {
    client.release();
  }
}

export async function createGameinfoGame(fields) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const nextOrder = await client.query(
      `SELECT COALESCE(MAX("order"), 0) + 1 AS next FROM games`
    );
    const result = await client.query(
      `INSERT INTO games (game_name, region, vpn, web_topup, platform, server, image, "order")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        normalizeFieldValue("gameName", fields.gameName),
        normalizeFieldValue("region", fields.region),
        normalizeFieldValue("vpn", fields.vpn),
        normalizeFieldValue("webTopup", fields.webTopup),
        normalizeFieldValue("platform", fields.platform),
        normalizeFieldValue("server", fields.server),
        normalizeFieldValue("image", fields.image),
        nextOrder.rows[0].next,
      ]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function updateGameinfoGame(id, fields) {
  const pool = await getReadyPool();
  const sets = [];
  const values = [];
  let i = 1;
  for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
    if (fields[field] !== undefined) {
      sets.push(`${column} = $${i++}`);
      values.push(normalizeFieldValue(field, fields[field]));
    }
  }
  if (!sets.length) return getGameinfoGame(id);
  sets.push(`updated_at = NOW()`);
  values.push(id);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE games SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!result.rows[0]) return null;
    const packsResult = await client.query(
      `SELECT game_id, pack_id, data FROM game_packs WHERE game_id = $1`,
      [id]
    );
    return mapRow(result.rows[0], packsResult.rows);
  } finally {
    client.release();
  }
}

export async function deleteGameinfoGame(id) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    // game_packs rows cascade via the FK — nothing extra to clean up here.
    await client.query(`DELETE FROM games WHERE id = $1`, [id]);
  } finally {
    client.release();
  }
}

export async function reorderGameinfoGames(orderedIds) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let index = 0; index < orderedIds.length; index += 1) {
      await client.query(`UPDATE games SET "order" = $1 WHERE id = $2`, [
        index,
        orderedIds[index],
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Replaces every pack row for this game in one transaction (full-tree save,
 * matching how the pack editor already works — it edits the whole tree in
 * memory and saves it all at once, so a delete+reinsert is simpler and just
 * as correct as diffing). */
export async function saveGameinfoPacks(id, { currencies, computedColumns }) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE games SET computed_column = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(Array.isArray(computedColumns) ? computedColumns : []), id]
    );
    await client.query(`DELETE FROM game_packs WHERE game_id = $1`, [id]);
    const rows = flattenCurrencies(id, Array.isArray(currencies) ? currencies : []);
    for (const r of rows) {
      await client.query(
        `INSERT INTO game_packs (game_id, pack_id, data) VALUES ($1, $2, $3)`,
        [r.gameId, r.packId, JSON.stringify(r.data)]
      );
    }
    await client.query("COMMIT");

    const gameResult = await client.query(`SELECT * FROM games WHERE id = $1`, [id]);
    if (!gameResult.rows[0]) return null;
    const packsResult = await client.query(
      `SELECT game_id, pack_id, data FROM game_packs WHERE game_id = $1`,
      [id]
    );
    return mapRow(gameResult.rows[0], packsResult.rows);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Bulk CSV import: apply each game's incoming pack tree. A game_id that isn't
 * in the database is skipped and reported in `notFound` (import never creates
 * games). "add" merges onto the game's current packs; "replace" overwrites
 * them. Either way the game's existing computed columns are preserved — a pack
 * import must not wipe formulas. Each game is saved on its own so one bad game
 * can't roll back the rest. */
export async function importGameinfoPacks(perGame, mode) {
  const updated = [];
  const notFound = [];
  for (const entry of perGame || []) {
    const gameId = Number(entry.gameId);
    const existing = await getGameinfoGame(gameId);
    if (!existing) {
      notFound.push(gameId);
      continue;
    }
    const incoming = Array.isArray(entry.currencies) ? entry.currencies : [];
    const currencies =
      mode === "add" ? mergeCurrencies(existing.currencies, incoming) : incoming;
    await saveGameinfoPacks(gameId, {
      currencies,
      computedColumns: existing.computedColumns,
    });
    updated.push(gameId);
  }
  return { updated, notFound };
}
