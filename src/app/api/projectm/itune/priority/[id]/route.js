import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import {
  listItunePriorityQueue,
  setItuneClaimHold,
  setItunePriorityPinned,
} from "@/server/itune-entries-repository";

// Per-entry queue controls: `pinned` moves a row between the automatic and
// the manually-ordered zone, `claimHold` takes it out of the claimable pool
// entirely. Both are independent — a pinned row can also be held. Returns
// the whole requeued list so the page never has to guess where the row
// landed in the new order.
export async function PATCH(request, { params }) {
  try {
    const actor = await requireProjectmAdmin(request);
    const { id } = await params;
    const entryId = Number(id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return jsonError("id ไม่ถูกต้อง", 400);
    }
    const body = await request.json();
    if (body.pinned === undefined && body.claimHold === undefined) {
      return jsonError("ไม่มีการเปลี่ยนแปลงที่จะบันทึก", 400);
    }
    if (body.pinned !== undefined) {
      await setItunePriorityPinned(entryId, Boolean(body.pinned), actor);
    }
    if (body.claimHold !== undefined) {
      await setItuneClaimHold(entryId, Boolean(body.claimHold), actor);
    }
    const entries = await listItunePriorityQueue();
    return jsonOk({ entries });
  } catch (err) {
    return handleApiError(err, "อัปเดตคิวไม่สำเร็จ");
  }
}
