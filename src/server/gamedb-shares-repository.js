import crypto from "crypto";

import { getPool } from "@/lib/db";

let schemaReady;

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS gamedb_shares (
        id         SERIAL PRIMARY KEY,
        token      VARCHAR(64) NOT NULL UNIQUE,
        query_id   INT NOT NULL REFERENCES gamedb_queries(id) ON DELETE CASCADE,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      )
    `);
    // A query can be shared and unshared repeatedly, and every revoked token has
    // to stay refusable, so uniqueness is only enforced over the live ones.
    await getPool().query(`
      CREATE UNIQUE INDEX IF NOT EXISTS gamedb_shares_live_query
      ON gamedb_shares (query_id) WHERE revoked_at IS NULL
    `);
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });

  return schemaReady;
}

function mapRow(row) {
  if (!row) return null;
  return {
    token: row.token,
    queryId: row.query_id,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
  };
}

export async function findShareForQuery(queryId) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT token, query_id, created_by, created_at
     FROM gamedb_shares
     WHERE query_id = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [queryId]
  );
  return mapRow(result.rows[0]);
}

/**
 * The token is the whole credential — it is handed to people who never sign in —
 * so it comes from the CSPRNG at 32 bytes, not from an id or a timestamp.
 */
export async function createShare(queryId, createdBy) {
  await ensureSchema();
  const existing = await findShareForQuery(queryId);
  if (existing) return existing;

  const token = crypto.randomBytes(32).toString("base64url");
  const result = await getPool().query(
    `INSERT INTO gamedb_shares (token, query_id, created_by)
     VALUES ($1, $2, $3)
     RETURNING token, query_id, created_by, created_at`,
    [token, queryId, createdBy || ""]
  );
  return mapRow(result.rows[0]);
}

export async function revokeShare(queryId) {
  await ensureSchema();
  await getPool().query(
    `UPDATE gamedb_shares SET revoked_at = NOW()
     WHERE query_id = $1 AND revoked_at IS NULL`,
    [queryId]
  );
}

export async function findQueryIdByToken(token) {
  if (!token || typeof token !== "string" || token.length > 64) return null;
  await ensureSchema();
  const result = await getPool().query(
    `SELECT query_id FROM gamedb_shares
     WHERE token = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [token]
  );
  return result.rows[0]?.query_id ?? null;
}
