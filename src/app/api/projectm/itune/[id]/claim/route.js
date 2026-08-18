import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findItuneEntryById, releaseItuneEntry } from "@/server/itune-entries-repository";

// "คืนเมล" — releases a claim back to the pool. releaseItuneEntry itself
// enforces that only the claimant (or a projectm-admin) may do this.
export async function DELETE(request, { params }) {
  try {
    const actor = await requireAdmin(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const entry = await releaseItuneEntry(id, actor);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "คืนเมลไม่สำเร็จ");
  }
}
