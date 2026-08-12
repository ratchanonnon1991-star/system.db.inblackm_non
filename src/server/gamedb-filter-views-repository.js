import { getPool } from "@/lib/db";

let schemaReady;

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS gamedb_filter_views (
        id                 SERIAL PRIMARY KEY,
        query_id           INT NOT NULL,
        name               VARCHAR(120) NOT NULL,
        row_filter         TEXT NOT NULL DEFAULT '',
        lookup_row_filter  JSONB,
        param_values       JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by         VARCHAR(255),
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await getPool().query(
      `CREATE INDEX IF NOT EXISTS gamedb_filter_views_query_idx ON gamedb_filter_views (query_id)`
    );
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

function mapRow(row) {
  return {
    id: row.id,
    queryId: row.query_id,
    name: row.name,
    rowFilter: row.row_filter,
    lookupRowFilter: row.lookup_row_filter,
    paramValues: row.param_values || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Every saved filter preset for a query -- the search box text, the lookup
 * match/no-match toggle, and the bound param values, all captured together
 * so picking one puts the table back exactly the way it was when it was
 * saved, not just part of it. */
export async function listFilterViews(queryId) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, query_id, name, row_filter, lookup_row_filter, param_values, created_by, created_at
       FROM gamedb_filter_views
      WHERE query_id = $1
      ORDER BY id DESC`,
    [queryId]
  );
  return result.rows.map(mapRow);
}

export async function insertFilterView({
  queryId,
  name,
  rowFilter = "",
  lookupRowFilter = null,
  paramValues = {},
  createdBy = "",
}) {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO gamedb_filter_views (query_id, name, row_filter, lookup_row_filter, param_values, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, query_id, name, row_filter, lookup_row_filter, param_values, created_by, created_at`,
    [
      queryId,
      name,
      rowFilter,
      lookupRowFilter ? JSON.stringify(lookupRowFilter) : null,
      JSON.stringify(paramValues || {}),
      createdBy,
    ]
  );
  return mapRow(result.rows[0]);
}

/** Scoped to the query too, not just the id -- a filter view id from a
 * different query should refuse rather than silently delete something it
 * does not belong to. */
export async function deleteFilterView(queryId, filterViewId) {
  await ensureSchema();
  const result = await getPool().query(
    `DELETE FROM gamedb_filter_views WHERE id = $1 AND query_id = $2`,
    [filterViewId, queryId]
  );
  return result.rowCount > 0;
}
