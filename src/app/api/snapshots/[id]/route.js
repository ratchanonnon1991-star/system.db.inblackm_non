import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireSuperAdmin } from "@/server/auth";
import { deleteSnapshot, findSnapshot } from "@/server/gamedb-snapshots-repository";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const snapshot = await findSnapshot(id);
    if (!snapshot) return jsonError("ไม่พบ snapshot นี้", 404);
    return jsonOk({ snapshot });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลด snapshot ได้");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    await deleteSnapshot(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบ snapshot ไม่สำเร็จ");
  }
}
