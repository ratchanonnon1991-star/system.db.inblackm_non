import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { deleteRow, insertRow } from "@/server/gamedb-row-writer";
import { recordEdit } from "@/server/gamedb-edit-log";
import { invalidateQuery } from "@/server/gamedb-result-cache";
import { normalizeLayout } from "@/lib/gamedb-layout";

// Adding and removing rows is an admin-only capability, like editing a cell.
async function loadTarget(request, params) {
  const admin = await requireSuperAdmin(request);
  const { id } = await params;
  const query = await findQueryById(id);
  if (!query) return { error: jsonError("ไม่พบ Query นี้", 404) };

  const layout = normalizeLayout(query.layout);
  if (!layout.editable) {
    return { error: jsonError("Query นี้ยังไม่ได้เปิดให้แก้ไขข้อมูล", 400) };
  }

  const connection = query.connectionId
    ? await findConnectionWithSecret(query.connectionId)
    : null;
  if (query.connectionId && !connection) {
    return { error: jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว", 409) };
  }
  return { admin, query, layout, connection };
}

export async function POST(request, { params }) {
  try {
    const target = await loadTarget(request, params);
    if (target.error) return target.error;
    const { admin, query, layout, connection } = target;

    const body = await request.json();
    if (!body.values || typeof body.values !== "object" || Array.isArray(body.values)) {
      return jsonError("ไม่ได้ส่งค่าที่จะเพิ่ม", 400);
    }

    const { pkValue, summary } = await insertRow({
      editable: layout.editable,
      connection,
      values: body.values,
    });

    invalidateQuery(query.id);
    await recordEdit({
      queryId: query.id,
      actor: admin.username || admin.displayName || "",
      table: layout.editable.table,
      pkColumn: layout.editable.pk,
      pkValue,
      column: "(เพิ่มแถว)",
      oldValue: null,
      newValue: summary,
    });

    return jsonOk({ pkValue });
  } catch (err) {
    return handleApiError(err, "เพิ่มแถวไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    const target = await loadTarget(request, params);
    if (target.error) return target.error;
    const { admin, query, layout, connection } = target;

    const body = await request.json();
    const pkValue = body.pkValue;
    if (pkValue === null || pkValue === undefined || pkValue === "") {
      return jsonError(`ไม่พบค่า ${layout.editable.pk} ของแถวนี้`, 400);
    }

    const { summary } = await deleteRow({
      editable: layout.editable,
      connection,
      pkValue,
    });

    invalidateQuery(query.id);
    await recordEdit({
      queryId: query.id,
      actor: admin.username || admin.displayName || "",
      table: layout.editable.table,
      pkColumn: layout.editable.pk,
      pkValue,
      column: "(ลบแถว)",
      oldValue: summary,
      newValue: null,
    });

    return jsonOk({ deleted: 1 });
  } catch (err) {
    return handleApiError(err, "ลบแถวไม่สำเร็จ");
  }
}
