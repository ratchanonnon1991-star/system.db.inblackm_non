import { getPool } from "@/lib/db";

let schemaReady;

// Keeps a snapshot from turning into a multi-megabyte JSONB row.
const MAX_SNAPSHOT_ROWS = 5000;

function mapRow(row, withData) {
  const base = {
    id: row.id,
    queryId: row.query_id,
    name: row.name,
    params: row.params || {},
    rowCount: row.row_count,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
  };
  if (!withData) return base;
  return { ...base, columns: row.columns || [], rows: row.rows || [] };
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = getPool().query(`
    CREATE TABLE IF NOT EXISTS gamedb_snapshots (
      id         SERIAL PRIMARY KEY,
      query_id   INT NOT NULL,
      name       VARCHAR(255) NOT NULL,
      params     JSONB NOT NULL DEFAULT '{}'::jsonb,
      columns    JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows       JSONB NOT NULL DEFAULT '[]'::jsonb,
      row_count  INT NOT NULL DEFAULT 0,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

export async function listSnapshots(queryId) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, query_id, name, params, row_count, created_by, created_at
     FROM gamedb_snapshots WHERE query_id = $1 ORDER BY id DESC LIMIT 100`,
    [queryId]
  );
  return result.rows.map((row) => mapRow(row, false));
}

export async function findSnapshot(id) {
  await ensureSchema();
  const result = await getPool().query(`SELECT * FROM gamedb_snapshots WHERE id = $1`, [id]);
  return result.rows[0] ? mapRow(result.rows[0], true) : null;
}

export async function insertSnapshot({ queryId, name, params, result, createdBy }) {
  await ensureSchema();
  const rows = (result.rows || []).slice(0, MAX_SNAPSHOT_ROWS);
  const inserted = await getPool().query(
    `INSERT INTO gamedb_snapshots (query_id, name, params, columns, rows, row_count, created_by)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7)
     RETURNING id`,
    [
      queryId,
      name.slice(0, 255),
      JSON.stringify(params || {}),
      JSON.stringify(result.columns || []),
      JSON.stringify(rows),
      rows.length,
      createdBy || "",
    ]
  );
  return findSnapshot(inserted.rows[0].id);
}

export async function deleteSnapshot(id) {
  await ensureSchema();
  await getPool().query(`DELETE FROM gamedb_snapshots WHERE id = $1`, [id]);
}
