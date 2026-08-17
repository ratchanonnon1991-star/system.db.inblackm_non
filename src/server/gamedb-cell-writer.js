import { getPoolForConnection } from "@/lib/db";
import { quoteIdentifier } from "@/lib/gamedb-identifier";
import { realColumnOf, realPkOf, writeTargetFor } from "@/lib/gamedb-layout";
import { getConnectionFlags } from "@/server/gamedb-side-tables";

const STATEMENT_TIMEOUT_MS = 8000;

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function assertEditAllowed(editable, column) {
  if (!editable || !editable.table || !editable.pk) {
    throw createHttpError("Query นี้ยังไม่ได้ตั้งค่าให้แก้ไขข้อมูลได้", 400);
  }
  if (!editable.columns.includes(column)) {
    throw createHttpError(`คอลัมน์ "${column}" ไม่ได้อนุญาตให้แก้ไข`, 403);
  }
}

/**
 * The value a cell holds right now, read live (no lock -- nothing is being
 * changed). Used to refresh what an editor opens with, so double-clicking a
 * cell someone else already changed shows their value instead of whatever
 * was on screen from the last time this browser ran the query.
 */
export async function peekCell({ editable, connection, pkValue, column }) {
  assertEditAllowed(editable, column);
  const writeTarget = writeTargetFor(editable, column);
  const table = quoteIdentifier(writeTarget.table);
  const pk = quoteIdentifier(realPkOf(writeTarget));
  const target = quoteIdentifier(realColumnOf(editable, column));
  let client;
  try {
    client = await getPoolForConnection(connection).connect();
  } catch (err) {
    throw createHttpError(
      `เชื่อมต่อฐานข้อมูล${connection ? ` "${connection.name}"` : "หลัก"}ไม่ได้: ${err.message}`,
      502
    );
  }
  try {
    const result = await client.query(
      `SELECT ${target} AS value FROM ${table} WHERE ${pk} = $1`,
      [pkValue]
    );
    if (result.rowCount === 0) {
      throw createHttpError("ไม่พบแถวนี้ (อาจถูกลบไปแล้ว)", 404);
    }
    return { value: result.rows[0].value };
  } finally {
    client.release();
  }
}

/**
 * Writes one cell. Runs in a transaction that locks the row, refuses to touch
 * anything but exactly one row, and returns the value it replaced so the caller
 * can log it.
 *
 * `expectedValue`, when given, is compared against the row's real value the
 * moment it is locked -- before the moment this same value is read to show
 * an editor, or a while spent typing into one, someone else could have
 * changed it. A mismatch means exactly that happened: refused with a 409
 * rather than silently overwriting whatever they wrote, and the caller
 * decides whether to show the new value or write over it anyway.
 */
export async function updateCell({ editable, connection, pkValue, column, value, expectedValue }) {
  assertEditAllowed(editable, column);

  // Second gate, independent of the query's config: a database has to be
  // opted in to writes explicitly, and every connection starts read-only.
  const flags = await getConnectionFlags(connection?.id ?? null);
  if (!flags.allowWrite) {
    throw createHttpError(
      `ฐานข้อมูล "${connection ? connection.name : "หลัก (inblackm)"}" ยังไม่ได้เปิดให้เขียน — ` +
        "ไปติ๊ก \"อนุญาตให้แก้ไขข้อมูล\" ที่หน้าจัดการฐานข้อมูลก่อน",
      403
    );
  }

  // Which table this particular column lives in. For a query that joins, the
  // answer differs column by column, and so does the key that identifies the
  // row -- `pkValue` is the caller's value for *this* target's key column.
  const writeTarget = writeTargetFor(editable, column);
  const table = quoteIdentifier(writeTarget.table);
  // `column` and the target's pk name columns in the query's result; the table
  // knows them by whatever the SELECT aliased away from.
  const pk = quoteIdentifier(realPkOf(writeTarget));
  const target = quoteIdentifier(realColumnOf(editable, column));
  const nextValue = value === "" || value === undefined ? null : value;

  let client;
  try {
    client = await getPoolForConnection(connection).connect();
  } catch (err) {
    throw createHttpError(
      `เชื่อมต่อฐานข้อมูล${connection ? ` "${connection.name}"` : "หลัก"}ไม่ได้: ${err.message}`,
      502
    );
  }

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    const before = await client.query(
      `SELECT ${target} AS value FROM ${table} WHERE ${pk} = $1 FOR UPDATE`,
      [pkValue]
    );
    if (before.rowCount === 0) {
      throw createHttpError("ไม่พบแถวที่จะแก้ไข (อาจถูกลบไปแล้ว)", 404);
    }
    if (before.rowCount > 1) {
      throw createHttpError(
        `คอลัมน์ "${writeTarget.pk}" ไม่ใช่ค่าที่ไม่ซ้ำ — พบ ${before.rowCount} แถว จึงไม่แก้ไขให้`,
        409
      );
    }
    const actualBefore = before.rows[0].value;
    if (
      expectedValue !== undefined &&
      String(actualBefore ?? "") !== String(expectedValue ?? "")
    ) {
      throw createHttpError(
        `ค่าล่าสุดในฐานข้อมูลถูกเปลี่ยนไปแล้วเป็น "${actualBefore ?? ""}" (ไม่ตรงกับตอนที่คุณเริ่มแก้) — มีคนอื่นแก้ไขไปก่อนหน้านี้`,
        409
      );
    }

    const updated = await client.query(
      `UPDATE ${table} SET ${target} = $1 WHERE ${pk} = $2 RETURNING ${target} AS value`,
      [nextValue, pkValue]
    );
    if (updated.rowCount !== 1) {
      throw createHttpError("อัปเดตไม่สำเร็จ (จำนวนแถวไม่ตรง)", 409);
    }

    await client.query("COMMIT");
    return { oldValue: before.rows[0].value, newValue: updated.rows[0].value };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore: connection may already be aborted
    }
    if (err.status) throw err;
    throw createHttpError(`แก้ไขข้อมูลไม่สำเร็จ: ${err.message}`, 400);
  } finally {
    client.release();
  }
}
