import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireDataWriter } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { deleteRow, insertRow } from "@/server/gamedb-row-writer";
import { recordEdit } from "@/server/gamedb-edit-log";
import { invalidateQuery } from "@/server/gamedb-result-cache";
import { normalizeLayout } from "@/lib/gamedb-layout";
import { requestMeta } from "@/lib/request-meta";

// Adding and removing rows is an Admin capability by default; a Staff
// account can be granted it individually, and a "user" account only through
// a template that opts in (see requireDataWriter).
export async function loadTarget(request, params, { viewId } = {}) {
  const { id } = await params;
  const admin = await requireDataWriter(request, { queryId: Number(id), viewId });
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
    const body = await request.json();
    const target = await loadTarget(request, params, { viewId: body.viewId });
    if (target.error) return target.error;
    const { admin, query, layout, connection } = target;

    if (!body.values || typeof body.values !== "object" || Array.isArray(body.values)) {
      return jsonError("ไม่ได้ส่งค่าที่จะเพิ่ม", 400);
    }

    // Which table to add to, for a query that reads several. Checked against
    // the saved config inside insertRow, never quoted straight from here.
    const { pkValue, summary, table, pkColumn } = await insertRow({
      editable: layout.editable,
      connection,
      values: body.values,
      table: body.table,
    });

    invalidateQuery(query.id);
    await recordEdit({
      queryId: query.id,
      actor: admin.username || admin.displayName || "",
      table,
      pkColumn,
      pkValue,
      column: "(เพิ่มแถว)",
      oldValue: null,
      newValue: summary,
      ...requestMeta(request),
    });

    return jsonOk({ pkValue });
  } catch (err) {
    return handleApiError(err, "เพิ่มแถวไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    const body = await request.json();
    const target = await loadTarget(request, params, { viewId: body.viewId });
    if (target.error) return target.error;
    const { admin, query, layout, connection } = target;

    const pkValue = body.pkValue;
    if (pkValue === null || pkValue === undefined || pkValue === "") {
      return jsonError(`ไม่พบค่า ${layout.editable.pk} ของแถวนี้`, 400);
    }

    // Which table to remove from, for a query that reads several. Checked
    // against the saved config inside deleteRow, never quoted from here.
    const { summary, table, pkColumn } = await deleteRow({
      editable: layout.editable,
      connection,
      pkValue,
      table: body.table,
      pk: body.pk,
    });

    invalidateQuery(query.id);
    await recordEdit({
      queryId: query.id,
      actor: admin.username || admin.displayName || "",
      table,
      pkColumn,
      pkValue,
      column: "(ลบแถว)",
      oldValue: summary,
      newValue: null,
      ...requestMeta(request),
    });

    return jsonOk({ deleted: 1 });
  } catch (err) {
    return handleApiError(err, "ลบแถวไม่สำเร็จ");
  }
}
