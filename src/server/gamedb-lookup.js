import { getPoolForConnection } from "@/lib/db";
import { quoteIdentifier } from "@/lib/gamedb-identifier";
import { LOOKUP_LIMIT } from "@/lib/gamedb-layout";

const STATEMENT_TIMEOUT_MS = 8000;

/**
 * The rows behind a lookup dropdown.
 *
 * The table and the two columns come from the query's saved config, never from
 * the request — the caller only says which field it wants the list for — so
 * this cannot be pointed at a table the config does not already name. It reads
 * nothing else: two columns, ordered by the one on screen, capped.
 */
export async function fetchLookupOptions({ lookup, connection }) {
  const table = quoteIdentifier(lookup.table);
  const value = quoteIdentifier(lookup.valueColumn);
  const label = quoteIdentifier(lookup.labelColumn);

  let client;
  try {
    client = await getPoolForConnection(connection).connect();
  } catch (err) {
    const error = new Error(
      `เชื่อมต่อฐานข้อมูล${connection ? ` "${connection.name}"` : "หลัก"}ไม่ได้: ${err.message}`
    );
    error.status = 502;
    throw error;
  }

  try {
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await client.query(
      `SELECT ${value} AS value, ${label} AS label
       FROM ${table}
       WHERE ${value} IS NOT NULL
       ORDER BY ${label}
       LIMIT ${LOOKUP_LIMIT}`
    );
    return result.rows.map((row) => ({
      value: row.value,
      label: row.label === null || row.label === undefined ? String(row.value) : String(row.label),
    }));
  } catch (err) {
    const error = new Error(`อ่านรายการตัวเลือกไม่สำเร็จ: ${err.message}`);
    error.status = 400;
    throw error;
  } finally {
    client.release();
  }
}
