import { getPool } from "@/lib/db";

let schemaReady;

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS gamedb_login_log (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(255) NOT NULL,
        success    BOOLEAN NOT NULL,
        reason     VARCHAR(255),
        ip         VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Added after the table already existed in production -- IF NOT EXISTS
    // so an install that already ran the CREATE TABLE above picks this up
    // without a manual migration.
    await getPool().query(
      `ALTER TABLE gamedb_login_log ADD COLUMN IF NOT EXISTS user_agent TEXT`
    );
    // The brute-force guard now counts straight from this table on every
    // login attempt (see countRecentFailedLogins) instead of an in-memory
    // Map, so these two need to stay indexed as the table grows.
    await getPool().query(
      `CREATE INDEX IF NOT EXISTS gamedb_login_log_username_created_idx
         ON gamedb_login_log (lower(username), created_at)`
    );
    await getPool().query(
      `CREATE INDEX IF NOT EXISTS gamedb_login_log_ip_created_idx
         ON gamedb_login_log (ip, created_at)`
    );
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

/** Every login attempt is recorded here, success or not, so /log can answer
 * "who's been getting in (or trying to)". */
export async function recordLogin({ username, success, reason = "", ip = "", userAgent = "" }) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO gamedb_login_log (username, success, reason, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [username || "", Boolean(success), reason || "", ip || "", userAgent || ""]
  );
}

/** How many failed attempts a username or an IP has racked up since `since`
 * -- the brute-force guard's source of truth, so it survives a process
 * restart (an in-memory count would not) and, keyed by ip too, also catches
 * someone cycling through many usernames from one address instead of just
 * hammering one. */
export async function countRecentFailedLogins({ username, ip, since }) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT
       COUNT(*) FILTER (WHERE lower(username) = lower($1)) AS by_username,
       COUNT(*) FILTER (WHERE ip = $2 AND ip <> '') AS by_ip
     FROM gamedb_login_log
     WHERE success = false AND created_at > $3`,
    [username || "", ip || "", since]
  );
  const row = result.rows[0] || {};
  return {
    byUsername: Number(row.by_username || 0),
    byIp: Number(row.by_ip || 0),
  };
}

export async function listLogins(limit = 100) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, username, success, reason, ip, user_agent, created_at
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
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }));
}
