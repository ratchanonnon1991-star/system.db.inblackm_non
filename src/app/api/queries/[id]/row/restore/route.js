import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { restoreRow } from "@/server/gamedb-row-writer";
import { findEditById, recordEdit } from "@/server/gamedb-edit-log";
import { invalidateQuery } from "@/server/gamedb-result-cache";
import { requestMeta } from "@/lib/request-meta";
import { loadTarget } from "../route";

// Undoes a row delete recorded in the edit log, using the full column
// snapshot that was captured at delete time. Same write gate as adding a
// row (loadTarget -> requireDataWriter), since this is an insert either way.
//
// The snapshot is looked up server-side by the log entry's own id rather
// than accepted as a `values` object in the request body: restoreRow writes
// every key it is given, unfiltered, exactly like the deleted row required —
// so a values object controlled by the caller would let any account holding
// insert rights on this query write arbitrary columns of the underlying
// table (role, password_hash, ...), not just the ones this query's editable
// config allows. The log entry it must match is only ever written by a
// prior deleteRow() call, so its old_value is guaranteed to be a real row.
export async function POST(request, { params }) {
  try {
    const target = await loadTarget(request, params);
    if (target.error) return target.error;
    const { admin, query, layout, connection } = target;

    const body = await request.json();
    const logEntryId = Number(body.logEntryId);
    if (!Number.isInteger(logEntryId) || logEntryId <= 0) {
      return jsonError("ไม่มีข้อมูลที่จะกู้คืน", 400);
    }

    const entry = await findEditById(logEntryId);
    if (
      !entry ||
      entry.queryId !== query.id ||
      entry.column !== "(ลบแถว)" ||
      entry.table !== layout.editable?.table
    ) {
      return jsonError("ไม่พบข้อมูลที่จะกู้คืน หรือไม่ตรงกับ Query นี้", 404);
    }
    let values;
    try {
      values = JSON.parse(entry.oldValue || "");
    } catch {
      values = null;
    }
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return jsonError("กู้คืนไม่ได้ — ข้อมูลที่บันทึกไว้ยาวเกินไปหรือเสียหาย", 400);
    }

    const { pkValue } = await restoreRow({
      editable: layout.editable,
      connection,
      values,
    });

    invalidateQuery(query.id);
    await recordEdit({
      queryId: query.id,
      actor: admin.username || admin.displayName || "",
      table: layout.editable.table,
      pkColumn: layout.editable.pk,
      pkValue,
      column: "(กู้คืนแถวที่ลบ)",
      oldValue: null,
      newValue: JSON.stringify(values).slice(0, 2000),
      ...requestMeta(request),
    });

    return jsonOk({ pkValue });
  } catch (err) {
    return handleApiError(err, "กู้คืนแถวไม่สำเร็จ");
  }
}
