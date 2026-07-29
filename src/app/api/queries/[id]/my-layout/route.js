import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { findQueryById } from "@/server/gamedb-repository";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer";
import { deleteUserLayout, saveUserLayout } from "@/server/gamedb-side-tables";

// Admins and staff may keep a personal layout. The User role is deliberately
// locked to the template an admin assigned.
export async function PUT(request, { params }) {
  try {
    const user = await requireLayoutEditor(request);
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
    const user = await requireLayoutEditor(request);
    const { id } = await params;
    await deleteUserLayout(user.id, Number(id));
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถล้าง layout ส่วนตัวได้");
  }
}
