import { getPool } from "@/lib/db";

let schemaReady;

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS gamedb_cell_notes (
        id          SERIAL PRIMARY KEY,
        query_id    INT NOT NULL,
        pk_value    TEXT NOT NULL,
        column_name VARCHAR(255) NOT NULL,
        note        TEXT NOT NULL,
        author      VARCHAR(255),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (query_id, pk_value, column_name)
      )
    `);
  })();
  schemaReady.catch(() => {
    schemaReady = null;
  });
  return schemaReady;
}

/** Every note pinned to a cell of this query -- keyed by the result row's own
 * pk value, the same identity editing already uses, so a note stays put
 * across refreshes and sorts rather than tracking a row position. */
export async function listNotes(queryId) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT pk_value, column_name, note, author, updated_at
       FROM gamedb_cell_notes
      WHERE query_id = $1`,
    [queryId]
  );
  return result.rows.map((row) => ({
    pkValue: row.pk_value,
    column: row.column_name,
    note: row.note,
    author: row.author,
    updatedAt: row.updated_at,
  }));
}

/** Blank note deletes the row instead of storing an empty string -- there is
 * nothing to show for an empty note, and a leftover row would just be one
 * more thing listNotes has to filter back out on every load. */
export async function upsertNote({ queryId, pkValue, column, note, author = "" }) {
  await ensureSchema();
  const trimmed = String(note ?? "").trim();
  if (!trimmed) {
    await getPool().query(
      `DELETE FROM gamedb_cell_notes WHERE query_id = $1 AND pk_value = $2 AND column_name = $3`,
      [queryId, String(pkValue), column]
    );
    return null;
  }
  const result = await getPool().query(
    `INSERT INTO gamedb_cell_notes (query_id, pk_value, column_name, note, author)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (query_id, pk_value, column_name)
     DO UPDATE SET note = EXCLUDED.note, author = EXCLUDED.author, updated_at = NOW()
     RETURNING pk_value, column_name, note, author, updated_at`,
    [queryId, String(pkValue), column, trimmed, author]
  );
  const row = result.rows[0];
  return {
    pkValue: row.pk_value,
    column: row.column_name,
    note: row.note,
    author: row.author,
    updatedAt: row.updated_at,
  };
}
