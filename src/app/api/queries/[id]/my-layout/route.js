import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findQueryById } from "@/server/gamedb-repository";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer";
import { deleteUserLayout, saveUserLayout } from "@/server/gamedb-side-tables";

// A layout only this user sees. Anyone signed in may keep one; changing the
// layout everybody shares is the admin-only endpoint next door.
export async function PUT(request, { params }) {
  try {
    const user = await requireAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const body = await request.json();
    const layout = await saveUserLayout(user.id, query.id, sanitizeLayout(body.layout));
    return jsonOk({ layout });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถบันทึก layout ส่วนตัวได้");
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await requireAdmin(request);
    const { id } = await params;
    await deleteUserLayout(user.id, Number(id));
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถล้าง layout ส่วนตัวได้");
  }
}
