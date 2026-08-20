import { getPoolForConnection } from "@/lib/db";
import { findConnectionWithSecret, listConnections } from "@/server/connections-repository";

const CONNECTION_NAME = "gameinfo";
const schemaReadyByConnection = new Map();

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
        CREATE TABLE IF NOT EXISTS gamelist_reports (
          id          BIGSERIAL PRIMARY KEY,
          game_id     INTEGER NOT NULL,
          source      TEXT NOT NULL CHECK (source IN ('topup', 'admin')),
          message     TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
          created_by  TEXT NOT NULL DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_by TEXT,
          resolved_at TIMESTAMPTZ
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS gamelist_reports_game_status_idx ON gamelist_reports (game_id, status)`);
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

function mapReport(row) {
  return {
    id: Number(row.id),
    gameId: Number(row.game_id),
    source: row.source,
    message: row.message,
    status: row.status,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    resolvedBy: row.resolved_by || "",
    resolvedAt: row.resolved_at,
  };
}

export function normalizeGamelistReportMessage(message) {
  const normalized = String(message ?? "").trim().replace(/\r\n/g, "\n");
  if (!normalized) throw createHttpError("กรุณาระบุปัญหาที่พบ", 400);
  if (normalized.length > 1000) throw createHttpError("รายละเอียดปัญหาต้องยาวไม่เกิน 1,000 ตัวอักษร", 400);
  return normalized;
}

export async function listGamelistReports(gameId) {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(
      `SELECT * FROM gamelist_reports WHERE game_id = $1 ORDER BY (status = 'open') DESC, created_at DESC`,
      [gameId]
    );
    return result.rows.map(mapReport);
  } finally {
    client.release();
  }
}

export async function listOpenGamelistReportCountByGame() {
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(`SELECT game_id, COUNT(*)::int AS count FROM gamelist_reports WHERE status = 'open' GROUP BY game_id`);
    return Object.fromEntries(result.rows.map((row) => [row.game_id, Number(row.count)]));
  } finally {
    client.release();
  }
}

export async function createGamelistReport(gameId, { source, message, actor }) {
  const normalized = normalizeGamelistReportMessage(message);
  if (source !== "topup" && source !== "admin") throw createHttpError("แหล่ง report ไม่ถูกต้อง", 400);
  const client = await (await getReadyPool()).connect();
  try {
    const game = await client.query(`SELECT id FROM game_list WHERE id = $1`, [gameId]);
    if (game.rows.length !== 1) throw createHttpError("ไม่พบเกมที่ต้องการ report", 404);
    const result = await client.query(
      `INSERT INTO gamelist_reports (game_id, source, message, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [gameId, source, normalized, String(actor || "").slice(0, 200)]
    );
    return mapReport(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function setGamelistReportStatus(gameId, reportId, status, actor) {
  if (status !== "open" && status !== "resolved") throw createHttpError("สถานะ report ไม่ถูกต้อง", 400);
  const client = await (await getReadyPool()).connect();
  try {
    const result = await client.query(
      `UPDATE gamelist_reports
       SET status = $3,
           resolved_by = CASE WHEN $3 = 'resolved' THEN $4 ELSE NULL END,
           resolved_at = CASE WHEN $3 = 'resolved' THEN NOW() ELSE NULL END
       WHERE game_id = $1 AND id = $2
       RETURNING *`,
      [gameId, reportId, status, String(actor || "").slice(0, 200)]
    );
    if (!result.rows[0]) throw createHttpError("ไม่พบ report นี้", 404);
    return mapReport(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function deleteGamelistReportsForGame(gameId) {
  const client = await (await getReadyPool()).connect();
  try {
    await client.query(`DELETE FROM gamelist_reports WHERE game_id = $1`, [gameId]);
  } finally {
    client.release();
  }
}
