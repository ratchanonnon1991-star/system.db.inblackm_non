import { getPoolForConnection } from "@/lib/db";
import { quoteIdentifier } from "@/lib/gamedb-identifier";
import { deleteTargetsOf, insertTargetsOf, realColumnOf, realPkOf } from "@/lib/gamedb-layout";
import { getConnectionFlags } from "@/server/gamedb-side-tables";

const STATEMENT_TIMEOUT_MS = 8000;
// The log column is TEXT, but a row of a wide table is not worth keeping in
// full, and a runaway value should not be able to fill the log table.
const SUMMARY_LIMIT = 2000;

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * The same two gates the cell writer uses: the query has to be configured for
 * writing, and the database it points at has to be opted in to writes. Neither
 * is enough on its own.
 */
async function assertWritable(editable, connection, capability, what) {
  if (!editable || !editable.table || !editable.pk) {
    throw createHttpError("Query นี้ยังไม่ได้ตั้งค่าให้แก้ไขข้อมูลได้", 400);
  }
  if (!editable[capability]) {
    throw createHttpError(`Query นี้ยังไม่ได้เปิดให้${what}`, 403);
  }
  const flags = await getConnectionFlags(connection?.id ?? null);
  if (!flags.allowWrite) {
    throw createHttpError(
      `ฐานข้อมูล "${connection ? connection.name : "หลัก (inblackm)"}" ยังไม่ได้เปิดให้เขียน — ` +
        'ไปติ๊ก "อนุญาตให้แก้ไขข้อมูล" ที่หน้าจัดการฐานข้อมูลก่อน',
      403
    );
  }
}

async function connect(connection) {
  try {
    return await getPoolForConnection(connection).connect();
  } catch (err) {
    throw createHttpError(
      `เชื่อมต่อฐานข้อมูล${connection ? ` "${connection.name}"` : "หลัก"}ไม่ได้: ${err.message}`,
      502
    );
  }
}

function summarize(object) {
  const text = JSON.stringify(object ?? null);
  return text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT)}…` : text;
}

/**
 * Adds one row. Only columns the query already allows editing may be written,
 * so opening insert cannot reach a column that update could not.
 */
export async function insertRow({ editable, connection, values, table }) {
  await assertWritable(editable, connection, "allowInsert", "เพิ่มแถวใหม่");

  const targets = insertTargetsOf(editable);
  const into = table ? targets.find((entry) => entry.table === table) : targets[0];
  if (!into) {
    throw createHttpError(`Query นี้ไม่ได้ตั้งค่าให้เพิ่มแถวในตาราง "${table}"`, 400);
  }

  // Only that table's own columns. A column belonging to another table in the
  // same query would either be rejected by Postgres or, if this table happens
  // to have a column by the same name, quietly write to the wrong one.
  const allowed = new Set(into.columns);
  const offered = Object.entries(values || {}).filter(([column]) => allowed.has(column));
  if (offered.length === 0) {
    throw createHttpError("ไม่มีคอลัมน์ที่อนุญาตให้เขียนในข้อมูลที่ส่งมา", 400);
  }

  for (const input of editable.inputs || []) {
    if (!input.required || !allowed.has(input.column)) continue;
    const entry = offered.find(([column]) => column === input.column);
    const value = entry ? entry[1] : null;
    if (value === null || value === undefined || String(value).trim() === "") {
      throw createHttpError(`ต้องกรอก "${input.column}" ก่อน`, 400);
    }
  }

  // A blank box leaves the column out of the statement entirely. Passing NULL
  // instead would be a value like any other, and would override the column's
  // own DEFAULT — which is exactly what a created_at or a serial relies on.
  const entries = offered.filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );
  if (entries.length === 0) {
    throw createHttpError("ยังไม่ได้กรอกค่าอะไรเลย", 400);
  }

  const intoTable = quoteIdentifier(into.table);
  // The form is keyed by result column; the table is not.
  const pk = quoteIdentifier(into.pkColumn);
  const columns = entries.map(([column]) => quoteIdentifier(realColumnOf(editable, column)));
  const params = entries.map(([, value]) => value);
  const placeholders = params.map((_, index) => `$${index + 1}`);

  const client = await connect(connection);
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const inserted = await client.query(
      `INSERT INTO ${intoTable} (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING ${pk} AS pk`,
      params
    );
    await client.query("COMMIT");
    return {
      pkValue: inserted.rows[0]?.pk ?? null,
      // Which table it went into, so the log records the one actually written
      // rather than whichever the query happens to name first.
      table: into.table,
      pkColumn: into.pkColumn,
      summary: summarize(Object.fromEntries(entries)),
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore: the connection may already be aborted
    }
    if (err.status) throw err;
    throw createHttpError(`เพิ่มแถวไม่สำเร็จ: ${err.message}`, 400);
  } finally {
    client.release();
  }
}

// Single-column foreign keys pointing at the column a row is identified by.
// `to_regclass` resolves the configured name -- schema-qualified or not --
// as a bound value rather than by building a name into the statement. A
// composite foreign key is not listed; the DELETE still refuses on one, just
// with Postgres's own message rather than a count.
const REFERENCING_KEYS_SQL = `
  SELECT src_ns.nspname || '.' || src.relname AS table_name,
         src_col.attname AS column_name
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
    JOIN pg_catalog.pg_namespace src_ns ON src_ns.oid = src.relnamespace
    JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY
      AS keys(src_attnum, tgt_attnum, position) ON TRUE
    JOIN pg_catalog.pg_attribute src_col
      ON src_col.attrelid = src.oid AND src_col.attnum = keys.src_attnum
    JOIN pg_catalog.pg_attribute tgt_col
      ON tgt_col.attrelid = con.confrelid AND tgt_col.attnum = keys.tgt_attnum
   WHERE con.contype = 'f'
     AND con.confrelid = to_regclass($1)::oid
     AND tgt_col.attname = $2
     AND array_length(con.conkey, 1) = 1
   ORDER BY 1, 2
   LIMIT 20
`;

/**
 * Which other tables still point at this row, and how many rows each.
 *
 * Asked before the DELETE rather than after, so the answer is "public.orders
 * still has 240 rows for this game" instead of a constraint name. Runs on the
 * same client, inside the same transaction, with the row already locked --
 * a count taken outside it could be stale by the time the delete ran.
 */
async function countReferencesTo(client, tableName, pkColumn, pkValue) {
  const keys = await client.query(REFERENCING_KEYS_SQL, [tableName, pkColumn]);
  const blocking = [];
  for (const key of keys.rows) {
    // Both names go into the count below. A row that does not carry them is
    // not something to build a statement out of.
    if (!key.table_name || !key.column_name) continue;
    const counted = await client.query(
      `SELECT count(*)::bigint AS n FROM ${quoteIdentifier(key.table_name)}
        WHERE ${quoteIdentifier(key.column_name)} = $1`,
      [pkValue]
    );
    const rows = Number(counted.rows[0]?.n || 0);
    if (rows > 0) blocking.push({ table: key.table_name, column: key.column_name, rows });
  }
  return blocking;
}

/** Removes one row, and refuses if the key matches anything but exactly one. */
export async function deleteRow({ editable, connection, pkValue, table: fromTable, pk }) {
  await assertWritable(editable, connection, "allowDelete", "ลบแถว");

  // A row is removed from one table, identified by one key -- and the table
  // alone does not say which when the same one appears twice, so the key is
  // matched too. Both are only ever accepted from what the saved config
  // already writes through.
  const targets = deleteTargetsOf(editable);
  const from = fromTable
    ? targets.find((entry) => entry.table === fromTable && (!pk || entry.pk === pk))
    : targets[0];
  if (!from) {
    throw createHttpError(
      `Query นี้ไม่ได้ตั้งค่าให้ลบแถวในตาราง "${fromTable}"${pk ? ` ด้วยคอลัมน์ "${pk}"` : ""}`,
      400
    );
  }

  const table = quoteIdentifier(from.table);
  const keyColumn = quoteIdentifier(from.pkColumn);

  const client = await connect(connection);
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    // Read it first so the log says what was removed, and lock it so nothing
    // changes between the count and the delete.
    const before = await client.query(
      `SELECT * FROM ${table} WHERE ${keyColumn} = $1 FOR UPDATE`,
      [pkValue]
    );
    if (before.rowCount === 0) {
      throw createHttpError("ไม่พบแถวที่จะลบ (อาจถูกลบไปแล้ว)", 404);
    }
    if (before.rowCount > 1) {
      throw createHttpError(
        `คอลัมน์ "${from.pkColumn}" ไม่ใช่ค่าที่ไม่ซ้ำ — พบ ${before.rowCount} แถว จึงไม่ลบให้`,
        409
      );
    }

    // Removing a row other rows still point at is not a small mistake, and a
    // database configured to cascade would take them all with it without
    // anyone being told. Say what is attached and stop; deciding what happens
    // to 240 orders is not a decision to make by clicking delete on a game.
    const blocking = await countReferencesTo(client, from.table, from.pkColumn, pkValue);
    if (blocking.length > 0) {
      throw createHttpError(
        `ลบไม่ได้ — ยังมีข้อมูลอ้างถึงแถวนี้อยู่: ${blocking
          .map((entry) => `${entry.table} (${entry.rows.toLocaleString("th-TH")} แถว)`)
          .join(", ")} · ต้องจัดการข้อมูลเหล่านั้นก่อน`,
        409
      );
    }

    const deleted = await client.query(`DELETE FROM ${table} WHERE ${keyColumn} = $1`, [pkValue]);
    if (deleted.rowCount !== 1) {
      throw createHttpError("ลบไม่สำเร็จ (จำนวนแถวไม่ตรง)", 409);
    }

    await client.query("COMMIT");
    return { summary: summarize(before.rows[0]), table: from.table, pkColumn: from.pkColumn };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore: the connection may already be aborted
    }
    if (err.status) throw err;
    // The count above misses composite foreign keys and anything added
    // between the check and the delete. Postgres still refuses, and its
    // refusal is turned into the same answer rather than a raw message.
    if (err.code === "23503") {
      throw createHttpError(
        `ลบไม่ได้ — ยังมีข้อมูลในตารางอื่นอ้างถึงแถวนี้อยู่${
          err.table ? ` (${err.table})` : ""
        } ต้องจัดการข้อมูลนั้นก่อน`,
        409
      );
    }
    throw createHttpError(`ลบแถวไม่สำเร็จ: ${err.message}`, 400);
  } finally {
    client.release();
  }
}

/**
 * Puts a row back exactly as it was before it got deleted, from the full
 * column snapshot the edit log kept. Unlike insertRow this writes every
 * column the snapshot has (including the primary key itself) rather than
 * only the columns the query form exposes, since the point is to reproduce
 * what was actually removed, not to accept new user input.
 */
export async function restoreRow({ editable, connection, values }) {
  await assertWritable(editable, connection, "allowInsert", "กู้คืนแถวที่ลบ");

  const entries = Object.entries(values || {}).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    throw createHttpError("ไม่มีข้อมูลที่จะกู้คืน", 400);
  }

  const table = quoteIdentifier(editable.table);
  const pk = quoteIdentifier(realPkOf(editable));
  const columns = entries.map(([column]) => quoteIdentifier(column));
  const params = entries.map(([, value]) => value);
  const placeholders = params.map((_, index) => `$${index + 1}`);

  const client = await connect(connection);
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const inserted = await client.query(
      `INSERT INTO ${table} (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING ${pk} AS pk`,
      params
    );
    await client.query("COMMIT");
    return { pkValue: inserted.rows[0]?.pk ?? null };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore: the connection may already be aborted
    }
    if (err.status) throw err;
    throw createHttpError(`กู้คืนแถวไม่สำเร็จ: ${err.message}`, 400);
  } finally {
    client.release();
  }
}
