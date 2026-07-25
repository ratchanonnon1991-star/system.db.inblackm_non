import { getPool } from "@/lib/db";
import { hashPassword } from "@/server/passwords";

let schemaReady;

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    role: row.role,
    createdAt: row.created_at,
  };
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gamedb_users (
          id            SERIAL PRIMARY KEY,
          username      VARCHAR(64) NOT NULL UNIQUE,
          display_name  VARCHAR(255),
          password_hash TEXT NOT NULL,
          role          VARCHAR(16) NOT NULL DEFAULT 'staff'
                        CHECK (role IN ('admin', 'staff')),
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // First-run seed: create the initial admin from env so no password
      // ever lives in the codebase. Only runs when the table is empty.
      const existing = await client.query(
        `SELECT COUNT(*)::int AS count FROM gamedb_users`
      );
      const seedUser = (process.env.GAMEDB_ADMIN_USERNAME || "").trim();
      const seedPass = process.env.GAMEDB_ADMIN_PASSWORD || "";
      if ((existing.rows[0]?.count || 0) === 0 && seedUser && seedPass) {
        await client.query(
          `INSERT INTO gamedb_users (username, display_name, password_hash, role)
           VALUES ($1, $1, $2, 'admin')
           ON CONFLICT (username) DO NOTHING`,
          [seedUser, hashPassword(seedPass)]
        );
      }
    } finally {
      client.release();
    }
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });

  return schemaReady;
}

export async function findUserByUsername(username) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, username, display_name, password_hash, role, created_at
     FROM gamedb_users WHERE LOWER(username) = LOWER($1)`,
    [username]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...mapRow(row), passwordHash: row.password_hash };
}

export async function findUserById(id) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, username, display_name, role, created_at
     FROM gamedb_users WHERE id = $1`,
    [id]
  );
  return mapRow(result.rows[0]);
}

export async function listUsers() {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, username, display_name, role, created_at
     FROM gamedb_users ORDER BY id ASC`
  );
  return result.rows.map(mapRow);
}

export async function countAdmins() {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT COUNT(*)::int AS count FROM gamedb_users WHERE role = 'admin'`
  );
  return result.rows[0]?.count || 0;
}

export async function insertUser({ username, displayName, password, role }) {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO gamedb_users (username, display_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, display_name, role, created_at`,
    [username, displayName || username, hashPassword(password), role]
  );
  return mapRow(result.rows[0]);
}

export async function updateUser(id, fields) {
  await ensureSchema();
  const sets = [];
  const values = [];
  let i = 1;

  if (fields.displayName !== undefined) {
    sets.push(`display_name = $${i++}`);
    values.push(fields.displayName);
  }
  if (fields.role !== undefined) {
    sets.push(`role = $${i++}`);
    values.push(fields.role);
  }
  if (fields.password) {
    sets.push(`password_hash = $${i++}`);
    values.push(hashPassword(fields.password));
  }

  if (!sets.length) return findUserById(id);

  sets.push(`updated_at = NOW()`);
  values.push(id);

  const result = await getPool().query(
    `UPDATE gamedb_users SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING id, username, display_name, role, created_at`,
    values
  );
  return mapRow(result.rows[0]);
}

export async function deleteUser(id) {
  await ensureSchema();
  await getPool().query(`DELETE FROM gamedb_users WHERE id = $1`, [id]);
}
