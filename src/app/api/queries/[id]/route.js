import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findConnectionById } from "@/server/connections-repository";
import {
  deleteQuery,
  findQueryById,
  updateQuery,
} from "@/server/gamedb-repository";
import { validateReadOnlySql } from "@/server/gamedb-query-runner";

export async function PATCH(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await findQueryById(id);
    if (!existing) return jsonError("ไม่พบ Query นี้", 404);

    const body = await request.json();
    const fields = {};
    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return jsonError("กรุณาตั้งชื่อ Query", 400);
      fields.name = name;
    }
    if (body.description !== undefined) {
      fields.description = String(body.description || "").trim();
    }
    if (body.sqlText !== undefined) {
      fields.sqlText = validateReadOnlySql(body.sqlText);
    }
    if (body.connectionId !== undefined) {
      if (body.connectionId === null || body.connectionId === "") {
        fields.connectionId = null;
      } else {
        const connection = await findConnectionById(body.connectionId);
        if (!connection) return jsonError("ไม่พบฐานข้อมูลที่เลือก", 404);
        fields.connectionId = connection.id;
      }
    }

    const query = await updateQuery(id, fields);
    return jsonOk({ query });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถแก้ไข Query ได้");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await findQueryById(id);
    if (!existing) return jsonError("ไม่พบ Query นี้", 404);

    await deleteQuery(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถลบ Query ได้");
  }
}
