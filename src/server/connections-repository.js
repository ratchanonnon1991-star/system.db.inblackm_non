import { dropConnectionPool, getPool } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/server/crypto";

let schemaReady;

// Public shape never includes the password (even encrypted).
function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    ssl: row.ssl,
    hasPassword: Boolean(row.password_enc),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamedb_connections (
          id           SERIAL PRIMARY KEY,
          name         VARCHAR(255) NOT NULL,
          host         VARCHAR(255) NOT NULL,
          port         INT NOT NULL DEFAULT 5432,
          database     VARCHAR(255) NOT NULL,
          username     VARCHAR(255) NOT NULL,
          password_enc TEXT,
          ssl          BOOLEAN NOT NULL DEFAULT FALSE,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

export async function listConnections() {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, name, host, port, database, username, password_enc, ssl, created_at, updated_at
     FROM gamedb_connections ORDER BY name ASC, id ASC`
  );
  return result.rows.map(mapRow);
}

export async function findConnectionById(id) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, name, host, port, database, username, password_enc, ssl, created_at, updated_at
     FROM gamedb_connections WHERE id = $1`,
    [id]
  );
  return mapRow(result.rows[0]);
}

function mapSecretRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    password: row.password_enc ? decryptSecret(row.password_enc) : undefined,
    ssl: row.ssl,
    updatedAt: row.updated_at,
  };
}

/** Internal shape with the decrypted password — for pool creation only. */
export async function findConnectionWithSecret(id) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, name, host, port, database, username, password_enc, ssl, updated_at
     FROM gamedb_connections WHERE id = $1`,
    [id]
  );
  return mapSecretRow(result.rows[0]);
}

// The gameinfo/itune helpers each look their saved connection up by name on
// every call, and one GameInfo page fans out to ~17 of them at once. Without
// this cache that is 2 primary-DB round trips per helper per request, all
// queued on a 5-connection pool. Writes below clear it in this process; the
// TTL bounds how long another process (pm2 worker) can see a stale row.
const CONNECTION_BY_NAME_TTL_MS = 10_000;
const connectionByName = new Map();

/** Same as findConnectionWithSecret, matched by name (trimmed, case-insensitive). */
export function findConnectionWithSecretByName(name) {
  const key = String(name).trim().toLowerCase();
  const cached = connectionByName.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    await ensureSchema();
    const result = await getPool().query(
      `SELECT id, name, host, port, database, username, password_enc, ssl, updated_at
       FROM gamedb_connections WHERE LOWER(BTRIM(name)) = $1
       ORDER BY name ASC, id ASC LIMIT 1`,
      [key]
    );
    return mapSecretRow(result.rows[0]);
  })();
  connectionByName.set(key, { promise, expiresAt: Date.now() + CONNECTION_BY_NAME_TTL_MS });
  promise.catch(() => {
    if (connectionByName.get(key)?.promise === promise) connectionByName.delete(key);
  });
  return promise;
}

export async function insertConnection({ name, host, port, database, username, password, ssl }) {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO gamedb_connections (name, host, port, database, username, password_enc, ssl)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, host, port, database, username, password_enc, ssl, created_at, updated_at`,
    [
      name,
      host,
      port,
      database,
      username,
      password ? encryptSecret(password) : null,
      Boolean(ssl),
    ]
  );
  connectionByName.clear();
  return mapRow(result.rows[0]);
}

export async function updateConnection(id, fields) {
  await ensureSchema();
  const sets = [];
  const values = [];
  let i = 1;

  for (const key of ["name", "host", "database", "username"]) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (fields.port !== undefined) {
    sets.push(`port = $${i++}`);
    values.push(fields.port);
  }
  if (fields.ssl !== undefined) {
    sets.push(`ssl = $${i++}`);
    values.push(Boolean(fields.ssl));
  }
  // Empty string means "keep the current password"; a value replaces it.
  if (fields.password) {
    sets.push(`password_enc = $${i++}`);
    values.push(encryptSecret(fields.password));
  }

  if (!sets.length) return findConnectionById(id);

  sets.push(`updated_at = NOW()`);
  values.push(id);

  const result = await getPool().query(
    `UPDATE gamedb_connections SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING id, name, host, port, database, username, password_enc, ssl, created_at, updated_at`,
    values
  );
  connectionByName.clear();
  dropConnectionPool(id);
  return mapRow(result.rows[0]);
}

export async function deleteConnection(id) {
  await ensureSchema();
  await getPool().query(`DELETE FROM gamedb_connections WHERE id = $1`, [id]);
  connectionByName.clear();
  dropConnectionPool(id);
}
