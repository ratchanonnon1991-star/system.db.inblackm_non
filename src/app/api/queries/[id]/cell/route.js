import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { updateCell } from "@/server/gamedb-cell-writer";
import { recordEdit } from "@/server/gamedb-edit-log";
import { invalidateQuery } from "@/server/gamedb-result-cache";
import { normalizeLayout } from "@/lib/gamedb-layout";

// Writing data is the one thing staff cannot do — admins only.
export async function PATCH(request, { params }) {
  try {
    const admin = await requireSuperAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const layout = normalizeLayout(query.layout);
    if (!layout.editable) {
      return jsonError("Query นี้ยังไม่ได้เปิดให้แก้ไขข้อมูล", 400);
    }

    const body = await request.json();
    const column = String(body.column || "");
    const pkValue = body.pkValue;
    if (!column) return jsonError("ไม่ได้ระบุคอลัมน์ที่จะแก้", 400);
    if (pkValue === null || pkValue === undefined || pkValue === "") {
      return jsonError(`ไม่พบค่า ${layout.editable.pk} ของแถวนี้`, 400);
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
    });

    // A cached page must not be able to serve the value we just replaced.
    invalidateQuery(query.id);

    await recordEdit({
      queryId: query.id,
      actor: admin.username || admin.displayName || "",
      table: layout.editable.table,
      pkColumn: layout.editable.pk,
      pkValue,
      column,
      oldValue,
      newValue,
    });

    return jsonOk({ oldValue, newValue });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถแก้ไขข้อมูลได้");
  }
}
