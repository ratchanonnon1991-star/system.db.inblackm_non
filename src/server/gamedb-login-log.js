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

// Same two thresholds the login route's brute-force guard blocks at (see
// countRecentFailedLogins) -- shared here so the "someone is being blocked"
// alert below can never drift from what actually gets blocked.
export const MAX_ATTEMPTS_PER_USERNAME = 8;
export const MAX_ATTEMPTS_PER_IP = 30;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Usernames/IPs currently at or past the brute-force guard's threshold --
 * i.e. actually being blocked right now, not just active. Surfaced on /log
 * so an admin who opens it notices an attack in progress instead of only
 * ever seeing it after the fact, one row at a time, in the full list. */
export async function listLoginAlerts(since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)) {
  await ensureSchema();
  const [byUsername, byIp] = await Promise.all([
    getPool().query(
      `SELECT lower(username) AS key, COUNT(*) AS count
         FROM gamedb_login_log
        WHERE success = false AND created_at > $1 AND username <> ''
        GROUP BY lower(username)
       HAVING COUNT(*) >= $2
        ORDER BY count DESC`,
      [since, MAX_ATTEMPTS_PER_USERNAME]
    ),
    getPool().query(
      `SELECT ip AS key, COUNT(*) AS count
         FROM gamedb_login_log
        WHERE success = false AND created_at > $1 AND ip <> ''
        GROUP BY ip
       HAVING COUNT(*) >= $2
        ORDER BY count DESC`,
      [since, MAX_ATTEMPTS_PER_IP]
    ),
  ]);
  return [
    ...byUsername.rows.map((row) => ({ type: "username", key: row.key, count: Number(row.count) })),
    ...byIp.rows.map((row) => ({ type: "ip", key: row.key, count: Number(row.count) })),
  ];
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
