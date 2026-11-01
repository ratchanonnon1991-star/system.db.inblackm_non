// What the daily sheet read did, so the sheet-import page can show it: a run
// that fails otherwise leaves nothing but a line in the server log.
import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecretByName } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const KEEP_RUNS = 30;
const schemaReadyByConnection = new Map();

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function ensureSchema(connection) {
  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = schemaReadyByConnection.get(connection.id);
  if (cached?.cacheKey === cacheKey) return cached.promise;
  const promise = getPoolForConnection(connection).query(`
    CREATE TABLE IF NOT EXISTS gameinfo_sheet_sync_runs (
      id          BIGSERIAL PRIMARY KEY,
      finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      games       INTEGER NOT NULL DEFAULT 0,
      packs       INTEGER NOT NULL DEFAULT 0,
      failed      INTEGER NOT NULL DEFAULT 0,
      error       TEXT NOT NULL DEFAULT '',
      details     JSONB NOT NULL DEFAULT '[]'
    )
  `);
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

/** One run: `summary` and `results` as syncGameinfoSheetPackStatus gives them, or `error` when the whole run failed. */
export async function recordGameinfoSheetSyncRun({ summary = null, results = [], error = "" }) {
  const pool = await getReadyPool();
  const details = results
    .filter((item) => item.changed || item.error)
    .map(({ gameId, game, changes, error: gameError }) => ({ gameId, game, changes: changes || [], error: gameError || "" }));
  await pool.query(
    `INSERT INTO gameinfo_sheet_sync_runs (games, packs, failed, error, details) VALUES ($1, $2, $3, $4, $5)`,
    [summary?.games || 0, summary?.packs || 0, summary?.failed || 0, String(error).slice(0, 1000), JSON.stringify(details)]
  );
  await pool.query(
    `DELETE FROM gameinfo_sheet_sync_runs WHERE id NOT IN (SELECT id FROM gameinfo_sheet_sync_runs ORDER BY id DESC LIMIT $1)`,
    [KEEP_RUNS]
  );
}

/** The last run, or null before the first one. */
export async function getLatestGameinfoSheetSyncRun() {
  const pool = await getReadyPool();
  const result = await pool.query(
    `SELECT finished_at, games, packs, failed, error, details FROM gameinfo_sheet_sync_runs ORDER BY id DESC LIMIT 1`
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    finishedAt: new Date(row.finished_at).toISOString(),
    games: row.games,
    packs: row.packs,
    failed: row.failed,
    error: row.error,
    details: row.details,
  };
}
