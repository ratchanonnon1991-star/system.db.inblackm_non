import { getPool } from "@/lib/db";

let schemaReady;

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = getPool().query(`
    CREATE TABLE IF NOT EXISTS gamedb_login_log (
      id         SERIAL PRIMARY KEY,
      username   VARCHAR(255) NOT NULL,
      success    BOOLEAN NOT NULL,
      reason     VARCHAR(255),
      ip         VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

/** Every login attempt is recorded here, success or not, so /log can answer
 * "who's been getting in (or trying to)". */
export async function recordLogin({ username, success, reason = "", ip = "" }) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO gamedb_login_log (username, success, reason, ip)
     VALUES ($1, $2, $3, $4)`,
    [username || "", Boolean(success), reason || "", ip || ""]
  );
}

export async function listLogins(limit = 100) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, username, success, reason, ip, created_at
     FROM gamedb_login_log
     ORDER BY id DESC
     LIMIT $1`,
    [Math.min(500, Math.max(1, limit))]
  );
  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    success: row.success,
    reason: row.reason,
    ip: row.ip,
    createdAt: row.created_at,
  }));
}
