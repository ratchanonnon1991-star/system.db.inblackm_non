import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { deleteFilterView } from "@/server/gamedb-filter-views-repository";

export async function DELETE(request, { params }) {
  try {
    await requireAdmin(request);
    const { id, filterId } = await params;
    const queryId = Number(id);
    const filterViewId = Number(filterId);
    if (!Number.isInteger(queryId) || !Number.isInteger(filterViewId)) {
      return jsonError("คำขอไม่ถูกต้อง", 400);
    }
    const deleted = await deleteFilterView(queryId, filterViewId);
    if (!deleted) return jsonError("ไม่พบชุดตัวกรองนี้", 404);
    return jsonOk({ deleted: true });
  } catch (err) {
    return handleApiError(err, "ลบชุดตัวกรองไม่สำเร็จ");
  }
}
