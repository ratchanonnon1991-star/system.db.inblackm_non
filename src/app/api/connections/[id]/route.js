import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import {
  deleteConnection,
  findConnectionById,
  updateConnection,
} from "@/server/connections-repository";

export async function PATCH(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await findConnectionById(id);
    if (!existing) return jsonError("ไม่พบฐานข้อมูลนี้", 404);

    const body = await request.json();
    const fields = {};
    for (const key of ["name", "host", "database", "username"]) {
      if (body[key] !== undefined) {
        const value = String(body[key] || "").trim();
        if (!value) return jsonError(`กรุณากรอก ${key}`, 400);
        fields[key] = value;
      }
    }
    if (body.port !== undefined) {
      const port = Number(body.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return jsonError("พอร์ตไม่ถูกต้อง", 400);
      }
      fields.port = port;
    }
    if (body.ssl !== undefined) fields.ssl = Boolean(body.ssl);
    if (body.password) fields.password = String(body.password);

    const connection = await updateConnection(id, fields);
    return jsonOk({ connection });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถแก้ไขฐานข้อมูลได้");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await findConnectionById(id);
    if (!existing) return jsonError("ไม่พบฐานข้อมูลนี้", 404);

    // Queries pointing here fall back to the primary DB (FK ON DELETE SET NULL).
    await deleteConnection(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถลบฐานข้อมูลได้");
  }
}
