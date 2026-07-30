import { getPoolForConnection } from "@/lib/db";
import { bindSqlParams, stripSqlLiterals } from "@/lib/gamedb-sql-params";
import { getConnectionFlags } from "@/server/gamedb-side-tables";

const STATEMENT_TIMEOUT_MS = 8000;

// Everything that changes the shape of the database, plus the read-only
// runner's list of ways out of the query. UPDATE and DELETE are here too: this
// runs one INSERT, and a script that also updates or deletes is a script whose
// author should say so out loud in a different feature.
const FORBIDDEN_KEYWORDS =
  /\b(update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|call|execute|prepare|deallocate|listen|notify|set|reset|refresh|reindex|cluster|checkpoint|lock|pg_sleep|pg_read_file|pg_ls_dir)\b/i;

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * The saved script must be one INSERT and nothing else.
 *
 * Checks read the statement with string literals, quoted identifiers and
 * comments blanked out, so a value containing the word "delete" or a semicolon
 * is data, not a second statement — the same reason the read-only runner does
 * it. ON CONFLICT ... DO UPDATE is the one place UPDATE belongs in an INSERT,
 * so that phrase is removed before the keyword check rather than the keyword
 * being allowed everywhere.
 */
export function validateInsertSql(sqlText) {
  const sql = String(sqlText || "")
    .trim()
    .replace(/;+\s*$/, "");
  if (!sql) {
    throw createHttpError("ยังไม่ได้บันทึกสคริปต์ INSERT ของ Query นี้", 400);
  }
  const bare = stripSqlLiterals(sql);
  if (bare.includes(";")) {
    throw createHttpError("อนุญาตครั้งละ 1 statement เท่านั้น", 400);
  }
  if (!/^insert\s+into\b/i.test(sql)) {
    throw createHttpError("สคริปต์ต้องขึ้นต้นด้วย INSERT INTO เท่านั้น", 400);
  }
  // The whole phrase, not the keyword alone: SET is forbidden on its own too,
  // and DO UPDATE SET is the only shape in which either belongs in an INSERT.
  const checked = bare.replace(/\bdo\s+update\s+set\b/gi, " ");
  if (FORBIDDEN_KEYWORDS.test(checked)) {
    throw createHttpError(
      "สคริปต์มีคำสั่งที่ไม่อนุญาต — เพิ่มข้อมูลได้อย่างเดียว (INSERT)",
      400
    );
  }
  return sql;
}

/**
 * Runs the query's saved INSERT with the values someone typed into the form.
 *
 * The values only ever arrive as bound parameters, so no amount of quoting in
 * them changes what the statement does. Two gates stand in front of it: the
 * caller has to be allowed to edit, which the route checks, and the connection
 * has to be opted in to writing, which is checked here — the same switch the
 * cell writer honours.
 */
export async function runInsertForm({ insertForm, connection, values = {} }) {
  if (!insertForm?.sql) {
    throw createHttpError("Query นี้ยังไม่ได้ตั้งค่าฟอร์มเพิ่มข้อมูล", 400);
  }
  const flags = await getConnectionFlags(connection?.id ?? null);
  if (!flags.allowWrite) {
    throw createHttpError(
      `ฐานข้อมูล "${connection ? connection.name : "หลัก (inblackm)"}" ยังไม่ได้เปิดให้เขียน — ` +
        'ไปติ๊ก "อนุญาตให้แก้ไขข้อมูล" ที่หน้าจัดการฐานข้อมูลก่อน',
      403
    );
  }

  const sql = validateInsertSql(insertForm.sql);

  // A field the admin marked optional may be left blank; a required one may
  // not. bindSqlParams turns both into NULL, so the difference has to be
  // decided before it, from the saved form rather than from what was sent.
  const bound = bindSqlParams(sql, values);
  const missingRequired = bound.missing.filter((name) => {
    const field = (insertForm.fields || []).find((item) => item.name === name);
    return !field || field.required !== false;
  });
  if (missingRequired.length > 0) {
    const labels = missingRequired.map((name) => {
      const field = (insertForm.fields || []).find((item) => item.name === name);
      return field?.label || name;
    });
    throw createHttpError(`กรุณากรอก: ${labels.join(", ")}`, 400);
  }

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
    const result = await client.query(bound.text, bound.values);
    await client.query("COMMIT");
    return { rowCount: result.rowCount ?? 0 };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // the connection is going back to the pool either way
    }
    throw createHttpError(`เพิ่มข้อมูลไม่สำเร็จ: ${err.message}`, 400);
  } finally {
    client.release();
  }
}
