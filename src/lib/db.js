import pg from "pg";

const { Pool } = pg;

let pool;
const connectionPools = new Map();

/** PostgreSQL กลางตัวเดียวกับ inblackm storefront (อ่าน users + เก็บ gamedb_queries) */
export function getPool() {
  if (!pool) {
    const host = process.env.PG_HOST;
    const database = process.env.PG_DATABASE;
    const user = process.env.PG_USER;
    if (!host || !database || !user) {
      throw new Error("Database is not configured (PG_HOST, PG_DATABASE, PG_USER).");
    }
    pool = new Pool({
      host,
      port: Number(process.env.PG_PORT || 5432),
      user,
      password: process.env.PG_PASSWORD,
      database,
      ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }
  return pool;
}

/**
 * Pool for a saved connection ({ id, host, port, database, username,
 * password, ssl, updatedAt }); null/undefined falls back to the primary pool.
 * Cached per id and invalidated when updatedAt changes (connection edited).
 */
export function getPoolForConnection(connection) {
  if (!connection) return getPool();

  const cacheKey = `${connection.id}:${connection.updatedAt}`;
  const cached = connectionPools.get(connection.id);
  if (cached && cached.cacheKey === cacheKey) return cached.pool;

  if (cached) {
    cached.pool.end().catch(() => {});
  }
  const nextPool = new Pool({
    host: connection.host,
    port: Number(connection.port || 5432),
    user: connection.username,
    password: connection.password,
    database: connection.database,
    ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
    max: 3,
    connectionTimeoutMillis: 8000,
  });
  connectionPools.set(connection.id, { cacheKey, pool: nextPool });
  return nextPool;
}

/** One-off connectivity check with a throwaway client (works for unsaved configs). */
export async function testDatabaseConnection({ host, port, database, username, password, ssl }) {
  const client = new pg.Client({
    host,
    port: Number(port || 5432),
    user: username,
    password,
    database,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT current_database() AS db, current_user AS usr, version() AS version"
    );
    return result.rows[0];
  } finally {
    await client.end().catch(() => {});
  }
}

export function dropConnectionPool(connectionId) {
  const cached = connectionPools.get(connectionId);
  if (cached) {
    connectionPools.delete(connectionId);
    cached.pool.end().catch(() => {});
  }
}
