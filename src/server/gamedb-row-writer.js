import { getPoolForConnection } from "@/lib/db";
import { quoteIdentifier } from "@/lib/gamedb-identifier";
import { realColumnOf, realPkOf } from "@/lib/gamedb-layout";
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
export async function insertRow({ editable, connection, values }) {
  await assertWritable(editable, connection, "allowInsert", "เพิ่มแถวใหม่");

  const allowed = new Set(editable.columns);
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

  const table = quoteIdentifier(editable.table);
  // The form is keyed by result column; the table is not.
  const pk = quoteIdentifier(realPkOf(editable));
  const columns = entries.map(([column]) => quoteIdentifier(realColumnOf(editable, column)));
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
    return {
      pkValue: inserted.rows[0]?.pk ?? null,
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

/** Removes one row, and refuses if the key matches anything but exactly one. */
export async function deleteRow({ editable, connection, pkValue }) {
  await assertWritable(editable, connection, "allowDelete", "ลบแถว");

  const table = quoteIdentifier(editable.table);
  const pk = quoteIdentifier(realPkOf(editable));

  const client = await connect(connection);
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    // Read it first so the log says what was removed, and lock it so nothing
    // changes between the count and the delete.
    const before = await client.query(
      `SELECT * FROM ${table} WHERE ${pk} = $1 FOR UPDATE`,
      [pkValue]
    );
    if (before.rowCount === 0) {
      throw createHttpError("ไม่พบแถวที่จะลบ (อาจถูกลบไปแล้ว)", 404);
    }
    if (before.rowCount > 1) {
      throw createHttpError(
        `คอลัมน์ "${editable.pk}" ไม่ใช่ค่าที่ไม่ซ้ำ — พบ ${before.rowCount} แถว จึงไม่ลบให้`,
        409
      );
    }

    const deleted = await client.query(`DELETE FROM ${table} WHERE ${pk} = $1`, [pkValue]);
    if (deleted.rowCount !== 1) {
      throw createHttpError("ลบไม่สำเร็จ (จำนวนแถวไม่ตรง)", 409);
    }

    await client.query("COMMIT");
    return { summary: summarize(before.rows[0]) };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore: the connection may already be aborted
    }
    if (err.status) throw err;
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
