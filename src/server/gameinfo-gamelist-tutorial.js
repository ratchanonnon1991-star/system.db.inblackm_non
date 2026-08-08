// "How to top up" tutorial for a game_list row — one game_id -> one JSONB
// blob of steps ({ id, title, description, imageUrl, videoUrl }[]), same
// "not ours to ALTER game_list, keep a side table" shape as gamelist_packs
// (see gameinfo-gamelist-packs.js) and gamelist_order. One row per game
// (not one row per step) since steps are always read/written as a whole list
// together from the popup editor — no need for a second table.
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
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
        CREATE TABLE IF NOT EXISTS gamelist_tutorials (
          game_id    INTEGER PRIMARY KEY,
          data       JSONB NOT NULL DEFAULT '{"steps":[]}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  if (!connection) {
    throw createHttpError(
      `ยังไม่ได้ตั้งค่าฐานข้อมูล "${CONNECTION_NAME}" — เพิ่ม Connection ชื่อนี้ก่อนที่หน้า Connections`,
      503
    );
  }
  await ensureSchema(connection);
  return getPoolForConnection(connection);
}

function normalizeStep(step, index) {
  return {
    id: step?.id ? String(step.id) : `step_${index + 1}`,
    title: String(step?.title ?? "").trim(),
    description: String(step?.description ?? "").trim(),
    imageUrl: String(step?.imageUrl ?? "").trim(),
    videoUrl: String(step?.videoUrl ?? "").trim(),
  };
}

/** { steps: [] } for one game_list row's id — empty steps if never saved. */
export async function getGamelistTutorial(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT data FROM gamelist_tutorials WHERE game_id = $1`,
      [gameId]
    );
    const steps = result.rows[0]?.data?.steps;
    return { steps: Array.isArray(steps) ? steps.map(normalizeStep) : [] };
  } finally {
    client.release();
  }
}

/** Full replace, upserted — same "edit the whole list in memory, save it all
 * at once" shape as the pack editor. */
export async function saveGamelistTutorial(gameId, steps) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const normalized = (Array.isArray(steps) ? steps : []).map(normalizeStep);
    await client.query(
      `INSERT INTO gamelist_tutorials (game_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (game_id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [gameId, JSON.stringify({ steps: normalized })]
    );
    return { steps: normalized };
  } finally {
    client.release();
  }
}

/** Cleanup hook for deleteGameListRow() — game_list isn't ours to put an FK
 * CASCADE on, so this has to be called explicitly, same as
 * deleteGamelistPacksForGame(). */
export async function deleteGamelistTutorialForGame(gameId) {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM gamelist_tutorials WHERE game_id = $1`, [gameId]);
  } finally {
    client.release();
  }
}

/** { [gameId]: true } for games that have at least one tutorial step —
 * lets the list table show a filled vs. empty Tutorial button without a
 * per-row query. */
export async function listGamelistTutorialPresence() {
  const pool = await getReadyPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT game_id FROM gamelist_tutorials WHERE jsonb_array_length(data->'steps') > 0`
    );
    const out = {};
    for (const row of result.rows) out[row.game_id] = true;
    return out;
  } finally {
    client.release();
  }
}
