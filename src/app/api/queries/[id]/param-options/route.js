import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { fetchDistinctColumnValues } from "@/server/gamedb-lookup";
import { normalizeLayout } from "@/lib/gamedb-layout";

/**
 * The dropdown values for every "select" param this query has set to fill
 * itself in from a column, instead of an admin typing the list by hand.
 *
 * Open to anyone who can run the query (same as /run), not just an admin --
 * a filter dropdown is a reading concern, not a write one. What keeps this
 * from becoming a way to browse an unrelated table is that `optionsTable`
 * only ever survives sanitizeLayout if it was set by whoever configured the
 * param (an admin), and here it is additionally required to actually appear
 * in this query's own SQL text -- so a param can only source values from a
 * table the query already reads from, never an arbitrary one.
 */
function queryReferencesTable(sqlText, table) {
  const unqualified = table.split(".").pop();
  if (!unqualified) return false;
  const pattern = new RegExp(`[."\\s]${unqualified.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[."\\s(]`, "iu");
  return pattern.test(` ${sqlText} `);
}

export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const layout = normalizeLayout(query.layout);
    const columnParams = (layout.params || []).filter(
      (param) =>
        param.type === "select" &&
        param.optionsSource === "column" &&
        param.optionsTable &&
        param.optionsColumn
    );
    if (columnParams.length === 0) return jsonOk({ options: {} });

    const connection = query.connectionId
      ? await findConnectionWithSecret(query.connectionId)
      : null;
    if (query.connectionId && !connection) {
      return jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว", 409);
    }

    const options = {};
    const failed = {};
    for (const param of columnParams) {
      if (!queryReferencesTable(query.sqlText, param.optionsTable)) {
        failed[param.name] = "คอลัมน์นี้ตั้งไว้ให้ดึงจากตารางที่ Query ไม่ได้อ่าน — แก้ที่ตั้งค่าพารามิเตอร์";
        options[param.name] = [];
        continue;
      }
      try {
        options[param.name] = await fetchDistinctColumnValues({
          table: param.optionsTable,
          column: param.optionsColumn,
          connection,
        });
      } catch (err) {
        failed[param.name] = err.message;
        options[param.name] = [];
      }
    }

    return jsonOk({ options, failed });
  } catch (err) {
    return handleApiError(err, "โหลดรายการตัวเลือกไม่สำเร็จ");
  }
}
