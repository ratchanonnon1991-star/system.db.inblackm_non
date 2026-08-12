import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { getPoolForConnection } from "@/lib/db";
import { getConnectionFlags } from "@/server/gamedb-side-tables";
import { buildAddColumnSql, buildCreateTableSql } from "@/lib/gamedb-schema-ddl";
import { recordEdit } from "@/server/gamedb-edit-log";
import { requestMeta } from "@/lib/request-meta";

const STATEMENT_TIMEOUT_MS = 8000;

function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Superadmin only, same write gate every other write path in this app uses
// (a connection has to opt in to writes explicitly), and scoped to exactly
// two statements -- see gamedb-schema-ddl.js for why not "any DDL".
export async function POST(request) {
  try {
    const admin = await requireSuperAdmin(request);
    const body = await request.json();
    const action = String(body.action || "");
    if (action !== "createTable" && action !== "addColumn") {
      return jsonError("ไม่รู้จักคำสั่งนี้", 400);
    }

    const connectionId = body.connectionId ? Number(body.connectionId) : null;
    const connection = connectionId ? await findConnectionWithSecret(connectionId) : null;
    if (connectionId && !connection) return jsonError("ไม่พบฐานข้อมูลที่เลือก", 404);

    const flags = await getConnectionFlags(connection?.id ?? null);
    if (!flags.allowWrite) {
      return jsonError(
        `ฐานข้อมูล "${connection ? connection.name : "หลัก (inblackm)"}" ยังไม่ได้เปิดให้เขียน — ` +
          'ไปติ๊ก "อนุญาตให้แก้ไขข้อมูล" ที่หน้าจัดการฐานข้อมูลก่อน',
        403
      );
    }

    let sql;
    let table;
    let logColumn;
    if (action === "createTable") {
      table = String(body.table || "");
      sql = buildCreateTableSql({
        table,
        columns: Array.isArray(body.columns) ? body.columns : [],
        primaryKeyColumn: String(body.primaryKeyColumn || ""),
      });
      logColumn = "(สร้างตาราง)";
    } else {
      table = String(body.table || "");
      sql = buildAddColumnSql({ table, column: String(body.column || ""), type: String(body.type || "") });
      logColumn = "(เพิ่มคอลัมน์)";
    }

    const client = await getPoolForConnection(connection).connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await client.query(sql);
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore: the connection may already be aborted
      }
      throw createHttpError(err.message, 400);
    } finally {
      client.release();
    }

    await recordEdit({
      queryId: null,
      actor: admin.username || admin.displayName || "",
      table,
      pkColumn: "",
      pkValue: null,
      column: logColumn,
      oldValue: null,
      newValue: sql,
      ...requestMeta(request),
    });

    return jsonOk({ sql });
  } catch (err) {
    return handleApiError(err, "รันคำสั่งไม่สำเร็จ");
  }
}
