import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireDataUpdater } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { peekCell, updateCell } from "@/server/gamedb-cell-writer";
import { recordEdit } from "@/server/gamedb-edit-log";
import { invalidateQuery } from "@/server/gamedb-result-cache";
import { normalizeLayout, writeTargetFor } from "@/lib/gamedb-layout";
import { requestMeta } from "@/lib/request-meta";

// Same gate as writing it -- a live peek exists to refresh an editor right
// before someone starts typing into it, not as a general read endpoint, and
// whoever can open that editor could already see this value in the query
// result anyway.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const queryId = Number(id);
    const url = new URL(request.url);
    const column = url.searchParams.get("column") || "";
    const pkValue = url.searchParams.get("pkValue");
    const viewId = url.searchParams.get("viewId") || undefined;
    await requireDataUpdater(request, { queryId, viewId });
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const layout = normalizeLayout(query.layout);
    if (!layout.editable) {
      return jsonError("Query นี้ยังไม่ได้เปิดให้แก้ไขข้อมูล", 400);
    }
    if (!column || pkValue === null || pkValue === "") {
      return jsonError("ไม่มีเซลล์ที่จะโหลดค่าล่าสุด", 400);
    }

    const connection = query.connectionId
      ? await findConnectionWithSecret(query.connectionId)
      : null;
    if (query.connectionId && !connection) {
      return jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว", 409);
    }

    const { value } = await peekCell({ editable: layout.editable, connection, pkValue, column });
    return jsonOk({ value });
  } catch (err) {
    return handleApiError(err, "โหลดค่าล่าสุดไม่สำเร็จ");
  }
}

// Editing a cell's value is an Admin capability by default; a Staff account
// can be granted it individually (see requireDataUpdater).
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const queryId = Number(id);
    const body = await request.json();
    const admin = await requireDataUpdater(request, { queryId, viewId: body.viewId });
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const layout = normalizeLayout(query.layout);
    if (!layout.editable) {
      return jsonError("Query นี้ยังไม่ได้เปิดให้แก้ไขข้อมูล", 400);
    }

    const column = String(body.column || "");
    const pkValue = body.pkValue;
    if (!column) return jsonError("ไม่ได้ระบุคอลัมน์ที่จะแก้", 400);
    // Which table this column belongs to, and so which key identifies its row
    // -- across a join that differs column by column, and the edit log has to
    // record the one actually written, or "ย้อนค่า" would later put the old
    // value back into the wrong table.
    const writeTarget = writeTargetFor(layout.editable, column);
    if (pkValue === null || pkValue === undefined || pkValue === "") {
      return jsonError(`ไม่พบค่า ${writeTarget.pk} ของแถวนี้`, 400);
    }

    const connection = query.connectionId
      ? await findConnectionWithSecret(query.connectionId)
      : null;
    if (query.connectionId && !connection) {
      return jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว", 409);
    }

    const { oldValue, newValue } = await updateCell({
      editable: layout.editable,
      connection,
      pkValue,
      column,
      value: body.value,
      expectedValue: body.expectedValue,
    });

    // A cached page must not be able to serve the value we just replaced.
    invalidateQuery(query.id);

    await recordEdit({
      queryId: query.id,
      actor: admin.username || admin.displayName || "",
      table: writeTarget.table,
      pkColumn: writeTarget.pk,
      pkValue,
      column,
      oldValue,
      newValue,
      ...requestMeta(request),
    });

    return jsonOk({ oldValue, newValue });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถแก้ไขข้อมูลได้");
  }
}
