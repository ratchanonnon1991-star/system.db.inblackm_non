// Packs for a game_list-based game — same UX as the old games/game_packs
// pack editor, but storage is deliberately as small as that one was before it
// grew a computed_column on `games`: one table keyed by (game_id, pack_id)
// with everything else as a JSONB blob. game_id here is game_list's own id
// (an external, shared table we don't own — no FK, no ON DELETE CASCADE;
// cleanup on game delete is done explicitly by deleteGameListRow()).
//
// Computed columns have nowhere else to live (game_list isn't ours to ALTER),
// so they're stored as one sentinel row per game at pack_id = "__computed__"
// rather than adding a second table — keeps the "just id -> pack_id -> json"
// shape the whole way through.
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const COMPUTED_SENTINEL = "__computed__";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// --- currencies[] (UI shape) <-> gamelist_packs rows (storage shape) -----
// Ported from the old games/game_packs storage (src/server/gameinfo-games.js,
// now removed — game_list-based storage was the only consumer left).

/** One flat row per pack -> the nested currency/category/pack tree the UI
 * (GameinfoGameView, GameinfoPackEditor) already expects. */
function reconstructCurrencies(packRows) {
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

async function getGameinfoConnection() {
  const connections = await listConnections();
  const match = connections.find((c) => c.name.trim().toLowerCase() === CONNECTION_NAME);
  if (!match) return null;
  return findConnectionWithSecret(match.id);
}

const schemaReadyByConnection = new Map();

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;

  const promise = (async () => {
    const pool = getPoolForConnection(connection);
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamelist_packs (
          game_id    INTEGER NOT NULL,
          pack_id    TEXT NOT NULL,
          data       JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (game_id, pack_id)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS gamelist_packs_game_id_idx ON gamelist_packs (game_id)
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
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

/** { currencies, computedColumns } for one game_list row's id. */
export async function getGamelistPacks(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT game_id, pack_id, data FROM gamelist_packs WHERE game_id = $1`,
      [gameId]
    );
    const computedRow = result.rows.find((r) => r.pack_id === COMPUTED_SENTINEL);
    const packRows = result.rows.filter((r) => r.pack_id !== COMPUTED_SENTINEL);
    return {
      currencies: reconstructCurrencies(packRows),
      computedColumns: Array.isArray(computedRow?.data?.columns) ? computedRow.data.columns : [],
    };
  } finally {
    client.release();
  }
}

/** Full-tree replace, same shape as the old saveGameinfoPacks — delete every
 * row for this game and reinsert, including the computed-columns sentinel. */
export async function saveGamelistPacks(gameId, { currencies, computedColumns }) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM gamelist_packs WHERE game_id = $1`, [gameId]);
    const rows = flattenCurrencies(gameId, Array.isArray(currencies) ? currencies : []);
    for (const r of rows) {
      await client.query(
        `INSERT INTO gamelist_packs (game_id, pack_id, data) VALUES ($1, $2, $3)`,
        [r.gameId, r.packId, JSON.stringify(r.data)]
      );
    }
    await client.query(
      `INSERT INTO gamelist_packs (game_id, pack_id, data) VALUES ($1, $2, $3)`,
      [gameId, COMPUTED_SENTINEL, JSON.stringify({ columns: Array.isArray(computedColumns) ? computedColumns : [] })]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getGamelistPacks(gameId);
}

/** { [gameId]: { main: string[], secondary: string[] } } — unique
 * channelsMain and channelsSecondary across every pack of every game, kept
 * separate (not merged into one list) so the UI can label which is which and
 * say "ไม่มี" for whichever side has nothing, one query for the whole list.
 * Same aggregation the old games-admin table did per game (see the removed
 * toRow() in gameinfo/[lang]/admin/page.js) — used to show a read-only
 * "channel" column on the game_list table without a per-row query per game. */
export async function listGamelistChannelsByGame() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT game_id, data FROM gamelist_packs WHERE pack_id != $1`,
      [COMPUTED_SENTINEL]
    );
    const byGame = new Map();
    for (const row of result.rows) {
      const entry = byGame.get(row.game_id) || { main: new Set(), secondary: new Set() };
      const d = row.data || {};
      (d.channelsMain || []).forEach((c) => c && entry.main.add(c));
      (d.channelsSecondary || []).forEach((c) => c && entry.secondary.add(c));
      byGame.set(row.game_id, entry);
    }
    const out = {};
    for (const [gameId, entry] of byGame) {
      out[gameId] = { main: [...entry.main], secondary: [...entry.secondary] };
    }
    return out;
  } finally {
    client.release();
  }
}

/** Every distinct channelsMain/channelsSecondary value across every game's
 * packs, main and secondary merged into one flat sorted list (not split by
 * game or by main/secondary side) — feeds the pack editor's channel
 * autocomplete so a channel typed for one game is immediately offered while
 * editing any other game's packs, instead of each game only "remembering"
 * its own. */
export async function listAllGamelistChannels() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT data FROM gamelist_packs WHERE pack_id != $1`,
      [COMPUTED_SENTINEL]
    );
    const all = new Set();
    for (const row of result.rows) {
      const d = row.data || {};
      (d.channelsMain || []).forEach((c) => c && all.add(c));
      (d.channelsSecondary || []).forEach((c) => c && all.add(c));
    }
    return [...all].sort((a, b) => a.localeCompare(b, "th"));
  } finally {
    client.release();
  }
}

/** { [gameId]: true } for games where at least one pack has a `country`
 * value set — `country` is only meaningful on VPN-required packs (see the
 * pack editor's vpnOn-gated country field), so its presence is used as the
 * source of truth for a "VPN" column instead of game_list's own free-text
 * `vpn` field (which this replaces). Absent from the map = "NO". */
export async function listGamelistVpnByGame() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT DISTINCT game_id FROM gamelist_packs
       WHERE pack_id != $1 AND NULLIF(TRIM(data->>'country'), '') IS NOT NULL`,
      [COMPUTED_SENTINEL]
    );
    const out = {};
    for (const row of result.rows) out[row.game_id] = true;
    return out;
  } finally {
    client.release();
  }
}

/** Cleanup hook for deleteGameListRow() — game_list isn't ours to put an FK
 * CASCADE on, so this has to be called explicitly. */
export async function deleteGamelistPacksForGame(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_packs WHERE game_id = $1`, [gameId]);
  } finally {
    client.release();
  }
}

/** { [gameId]: count } — number of real packs (the "__computed__" sentinel
 * row doesn't count) per game, one query for the whole list table. */
export async function listGamelistPackCountByGame() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT game_id, COUNT(*)::int AS pack_count FROM gamelist_packs
       WHERE pack_id != $1 GROUP BY game_id`,
      [COMPUTED_SENTINEL]
    );
    const out = {};
    for (const row of result.rows) out[row.game_id] = row.pack_count;
    return out;
  } finally {
    client.release();
  }
}
