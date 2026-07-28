import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireSuperAdmin } from "@/server/auth";
import {
  canUseView,
  deleteView,
  findViewById,
  updateView,
} from "@/server/gamedb-views-repository";

// Opening a template needs the recipient to actually be a recipient.
export async function GET(request, { params }) {
  try {
    const user = await requireAdmin(request);
    const { id } = await params;
    const view = await findViewById(id);
    if (!view) return jsonError("ไม่พบเทมเพลตนี้", 404);
    if (!canUseView(view, user)) return jsonError("ไม่มีสิทธิ์ใช้เทมเพลตนี้", 403);
    return jsonOk({ view });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดเทมเพลตได้");
  }
}

export async function PATCH(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await findViewById(id);
    if (!existing) return jsonError("ไม่พบเทมเพลตนี้", 404);

    const body = await request.json();
    const fields = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return jsonError("กรุณาตั้งชื่อเทมเพลต", 400);
      fields.name = name.slice(0, 255);
    }
    if (body.description !== undefined) {
      fields.description = String(body.description).trim().slice(0, 500);
    }
    if (body.config !== undefined) fields.config = body.config;
    if (body.isPublic !== undefined) fields.isPublic = body.isPublic;
    if (body.isDefault !== undefined) fields.isDefault = body.isDefault;
    if (body.sharedWith !== undefined) fields.sharedWith = body.sharedWith;

    const view = await updateView(id, fields);
    return jsonOk({ view });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถบันทึกเทมเพลตได้");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    await deleteView(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถลบเทมเพลตได้");
  }
}
