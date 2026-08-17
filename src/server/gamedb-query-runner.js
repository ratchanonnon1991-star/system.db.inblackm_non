import { getPoolForConnection } from "@/lib/db";
import { bindSqlParams, stripSqlLiterals } from "@/lib/gamedb-sql-params";
import { usesCrossJoin } from "@/lib/gamedb-sql-sources";
import { getConnectionFlags } from "@/server/gamedb-side-tables";

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
  // Both checks read the statement with string literals and comments blanked
  // out. Over the raw text they fire on ordinary data — an order whose status
  // is 'update', a LIKE pattern containing a semicolon — and refuse to run a
  // query that only ever reads.
  const bare = stripSqlLiterals(sql);
  if (bare.includes(";")) {
    throw createHttpError("อนุญาตครั้งละ 1 statement เท่านั้น", 400);
  }
  if (!/^(select|with)\b/i.test(sql)) {
    throw createHttpError("อนุญาตเฉพาะคำสั่ง SELECT / WITH เท่านั้น", 400);
  }
  if (FORBIDDEN_KEYWORDS.test(bare)) {
    throw createHttpError(
      "SQL มีคำสั่งที่ไม่อนุญาต (อ่านข้อมูลได้อย่างเดียว)",
      400
    );
  }
  // Not a safety rule like the ones above -- a decision about what belongs in
  // this app. A CROSS JOIN pairs every row with every row, which is a mistake
  // far more often than it is a plan, and it is checked here rather than in
  // the editor so it holds for the save, the preview and the API alike.
  if (usesCrossJoin(sql)) {
    throw createHttpError(
      "ไม่อนุญาตให้ใช้ CROSS JOIN — ใช้ JOIN ... ON เพื่อระบุว่าสองตารางเชื่อมกันด้วยอะไร",
      400
    );
  }
  return sql;
}

// int8, int2, int4, oid — the ones that will not take a fraction.
const INTEGER_TYPES = new Set([20, 21, 23, 26]);

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
// primary database from .env; params fills the query's :placeholders;
// offset/limit page through a result larger than one screenful
export async function runReadOnlyQuery(sqlText, connection = null, params = {}, page = {}) {
  const sql = validateReadOnlySql(sqlText);
  const bound = bindSqlParams(sql, params);
  if (bound.missing.length > 0) {
    throw createHttpError(
      `กรุณาใส่ค่าพารามิเตอร์: ${bound.missing.join(", ")}`,
      400
    );
  }

  // A slow or huge database can be given more room than the defaults.
  const flags = await getConnectionFlags(connection?.id ?? null);
  const timeoutMs = flags.statementTimeoutMs || STATEMENT_TIMEOUT_MS;
  const configuredMax = flags.maxRows || GAMEDB_MAX_ROWS;
  const limit = Math.min(
    configuredMax,
    Number.isFinite(Number(page.limit)) && Number(page.limit) > 0
      ? Math.round(Number(page.limit))
      : configuredMax
  );
  const offset =
    Number.isFinite(Number(page.offset)) && Number(page.offset) > 0
      ? Math.round(Number(page.offset))
      : 0;

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
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    const result = await client.query({
      // rowMode array keeps duplicate column names intact and aligns rows
      // with the fields list by position. One row past the limit is fetched so
      // the caller can tell "exactly full" from "there is more".
      text: `SELECT * FROM (${bound.text}) AS gamedb_result LIMIT ${limit + 1} OFFSET ${offset}`,
      values: bound.values,
      rowMode: "array",
    });
    await client.query("ROLLBACK");

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    return {
      columns: result.fields.map((field, index) => ({
        key: `c${index}`,
        name: field.name,
        type: mapColumnType(field.dataTypeID),
        // int2/int4/int8 and numeric all display as "number"; the edit box
        // still wants to know which, so a whole-number column refuses 1.5.
        integer: INTEGER_TYPES.has(field.dataTypeID),
      })),
      rows,
      rowCount: rows.length,
      truncated: hasMore,
      hasMore,
      offset,
      limit,
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
