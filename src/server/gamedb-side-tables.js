import { getPool } from "@/lib/db";

// Tables the service creates for itself. They live apart from gamedb_queries /
// gamedb_connections / gamedb_users on purpose: those three are owned by the
// database superuser, so the service cannot ALTER them to add a column. Every
// table here is created by the service's own role, which therefore owns it.
let schemaReady;

export const PRIMARY_CONNECTION_ID = 0;

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      // One layout per user per query, overriding the shared one.
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamedb_user_layouts (
          user_id    INT NOT NULL,
          query_id   INT NOT NULL,
          layout     JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, query_id)
        )
      `);
      // Writing data is off unless a connection is explicitly opted in.
      // connection_id 0 stands for the primary connection from .env.
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamedb_connection_flags (
          connection_id INT PRIMARY KEY,
          allow_write   BOOLEAN NOT NULL DEFAULT FALSE,
          statement_timeout_ms INT,
          max_rows      INT,
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    } finally {
      client.release();
    }
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

// --- personal layouts ------------------------------------------------------

export async function listUserLayouts(userId) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT query_id, layout FROM gamedb_user_layouts WHERE user_id = $1`,
    [userId]
  );
  const map = {};
  for (const row of result.rows) map[row.query_id] = row.layout;
  return map;
}

export async function saveUserLayout(userId, queryId, layout) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO gamedb_user_layouts (user_id, query_id, layout)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, query_id)
     DO UPDATE SET layout = EXCLUDED.layout, updated_at = NOW()`,
    [userId, queryId, JSON.stringify(layout)]
  );
  return layout;
}

export async function deleteUserLayout(userId, queryId) {
  await ensureSchema();
  await getPool().query(
    `DELETE FROM gamedb_user_layouts WHERE user_id = $1 AND query_id = $2`,
    [userId, queryId]
  );
}

// --- per-connection flags --------------------------------------------------

function mapFlags(row) {
  return {
    connectionId: row.connection_id,
    allowWrite: row.allow_write,
    statementTimeoutMs: row.statement_timeout_ms,
    maxRows: row.max_rows,
  };
}

export async function listConnectionFlags() {
  await ensureSchema();
  const result = await getPool().query(`SELECT * FROM gamedb_connection_flags`);
  const map = {};
  for (const row of result.rows) map[row.connection_id] = mapFlags(row);
  return map;
}

export async function getConnectionFlags(connectionId) {
  await ensureSchema();
  const id = connectionId ?? PRIMARY_CONNECTION_ID;
  const result = await getPool().query(
    `SELECT * FROM gamedb_connection_flags WHERE connection_id = $1`,
    [id]
  );
  return result.rows[0]
    ? mapFlags(result.rows[0])
    : { connectionId: id, allowWrite: false, statementTimeoutMs: null, maxRows: null };
}

export async function saveConnectionFlags(connectionId, fields) {
  await ensureSchema();
  const id = connectionId ?? PRIMARY_CONNECTION_ID;
  const clamp = (value, min, max) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.round(Math.min(max, Math.max(min, num)));
  };
  await getPool().query(
    `INSERT INTO gamedb_connection_flags (connection_id, allow_write, statement_timeout_ms, max_rows)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (connection_id)
     DO UPDATE SET allow_write = EXCLUDED.allow_write,
                   statement_timeout_ms = EXCLUDED.statement_timeout_ms,
                   max_rows = EXCLUDED.max_rows,
                   updated_at = NOW()`,
    [
      id,
      Boolean(fields.allowWrite),
      clamp(fields.statementTimeoutMs, 1000, 120000),
      // No floor worth enforcing: a 5-row page is a legitimate thing to ask for.
      clamp(fields.maxRows, 1, 100000),
    ]
  );
  return getConnectionFlags(id);
}
