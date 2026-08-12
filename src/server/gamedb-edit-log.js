import { getPool } from "@/lib/db";

let schemaReady;

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS gamedb_edit_log (
        id          SERIAL PRIMARY KEY,
        query_id    INT,
        actor       VARCHAR(255),
        table_name  VARCHAR(255) NOT NULL,
        pk_column   VARCHAR(255) NOT NULL,
        pk_value    TEXT,
        column_name VARCHAR(255) NOT NULL,
        old_value   TEXT,
        new_value   TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Added after the table already existed in production -- IF NOT EXISTS
    // so an install that already ran the CREATE TABLE above picks these up
    // without a manual migration.
    await getPool().query(`ALTER TABLE gamedb_edit_log ADD COLUMN IF NOT EXISTS ip VARCHAR(64)`);
    await getPool().query(`ALTER TABLE gamedb_edit_log ADD COLUMN IF NOT EXISTS user_agent TEXT`);
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

/** Every accepted cell edit is recorded here, in gamedb's own database. */
export async function recordEdit(entry) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO gamedb_edit_log
       (query_id, actor, table_name, pk_column, pk_value, column_name, old_value, new_value, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.queryId ?? null,
      entry.actor || "",
      entry.table,
      entry.pkColumn,
      entry.pkValue === null || entry.pkValue === undefined ? null : String(entry.pkValue),
      entry.column,
      entry.oldValue === null || entry.oldValue === undefined ? null : String(entry.oldValue),
      entry.newValue === null || entry.newValue === undefined ? null : String(entry.newValue),
      entry.ip || "",
      entry.userAgent || "",
    ]
  );
}

export async function listEdits(limit = 100) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, query_id, actor, table_name, pk_column, pk_value, column_name,
            old_value, new_value, ip, user_agent, created_at
     FROM gamedb_edit_log
     ORDER BY id DESC
     LIMIT $1`,
    [Math.min(500, Math.max(1, limit))]
  );
  return result.rows.map((row) => ({
    id: row.id,
    queryId: row.query_id,
    actor: row.actor,
    table: row.table_name,
    pkColumn: row.pk_column,
    pkValue: row.pk_value,
    column: row.column_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }));
}
