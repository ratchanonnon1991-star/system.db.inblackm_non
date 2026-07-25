import { getPoolForConnection } from "@/lib/db";

export const GAMEDB_MAX_ROWS = 1000;
const STATEMENT_TIMEOUT_MS = 8000;

// Keyword filter is the first fence; the READ ONLY transaction below is the
// real guarantee — anything that slips past the regex still cannot write.
const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|call|execute|prepare|deallocate|listen|notify|set|reset|refresh|reindex|cluster|checkpoint|lock|into|pg_sleep|pg_read_file|pg_ls_dir)\b/i;

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function validateReadOnlySql(sqlText) {
  const sql = String(sqlText || "")
    .trim()
    .replace(/;+\s*$/, "");
  if (!sql) {
    throw createHttpError("กรุณาใส่คำสั่ง SQL", 400);
  }
  if (sql.includes(";")) {
    throw createHttpError("อนุญาตครั้งละ 1 statement เท่านั้น", 400);
  }
  if (!/^(select|with)\b/i.test(sql)) {
    throw createHttpError("อนุญาตเฉพาะคำสั่ง SELECT / WITH เท่านั้น", 400);
  }
  if (FORBIDDEN_KEYWORDS.test(sql)) {
    throw createHttpError(
      "SQL มีคำสั่งที่ไม่อนุญาต (อ่านข้อมูลได้อย่างเดียว)",
      400
    );
  }
  return sql;
}

function mapColumnType(dataTypeID) {
  switch (dataTypeID) {
    case 20:
    case 21:
    case 23:
    case 26:
    case 700:
    case 701:
    case 1700:
      return "number";
    case 16:
      return "boolean";
    case 1082:
      return "date";
    case 1114:
    case 1184:
      return "datetime";
    default:
      return "text";
  }
}

// connection = saved connection with decrypted password, or null for the
// primary database from .env
export async function runReadOnlyQuery(sqlText, connection = null) {
  const sql = validateReadOnlySql(sqlText);
  let client;
  try {
    client = await getPoolForConnection(connection).connect();
  } catch (err) {
    throw createHttpError(
      `เชื่อมต่อฐานข้อมูล${connection ? ` "${connection.name}"` : "หลัก"}ไม่ได้: ${err.message}`,
      502
    );
  }
  const startedAt = Date.now();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await client.query({
      // rowMode array keeps duplicate column names intact and aligns rows
      // with the fields list by position.
      text: `SELECT * FROM (${sql}) AS gamedb_result LIMIT ${GAMEDB_MAX_ROWS + 1}`,
      rowMode: "array",
    });
    await client.query("ROLLBACK");

    const truncated = result.rows.length > GAMEDB_MAX_ROWS;
    const rows = truncated ? result.rows.slice(0, GAMEDB_MAX_ROWS) : result.rows;
    return {
      columns: result.fields.map((field, index) => ({
        key: `c${index}`,
        name: field.name,
        type: mapColumnType(field.dataTypeID),
      })),
      rows,
      rowCount: rows.length,
      truncated,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore: connection may already be aborted
    }
    if (err.status) throw err;
    throw createHttpError(`SQL ผิดพลาด: ${err.message}`, 400);
  } finally {
    client.release();
  }
}
