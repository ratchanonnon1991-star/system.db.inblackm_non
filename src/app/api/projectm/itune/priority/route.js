import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import {
  getItuneClaimSettings,
  listItunePriorityQueue,
  reorderItunePriority,
} from "@/server/itune-entries-repository";

// The claim queue as "รับเมล" will actually hand it out. The page renders
// its first copy server-side; this exists so the client can re-sync after
// its own edits (and after another admin's) without a full reload.
export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
    const [entries, settings] = await Promise.all([
      listItunePriorityQueue(),
      getItuneClaimSettings(),
    ]);
    return jsonOk({ entries, settings });
  } catch (err) {
    return handleApiError(err, "โหลดคิวรับเมลไม่สำเร็จ");
  }
}

// Drag-to-reorder of the pinned zone. `orderedIds` is the full pinned list
// in its new order — positions are the array indexes, so the client sends
// what it shows rather than a diff.
export async function POST(request) {
  try {
    await requireProjectmAdmin(request);
    const body = await request.json();
    if (!Array.isArray(body.orderedIds)) {
      return jsonError("ลำดับไม่ถูกต้อง", 400);
    }
    const orderedIds = body.orderedIds.map(Number);
    if (orderedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return jsonError("ลำดับไม่ถูกต้อง", 400);
    }
    await reorderItunePriority(orderedIds);
    const entries = await listItunePriorityQueue();
    return jsonOk({ entries });
  } catch (err) {
    return handleApiError(err, "บันทึกลำดับคิวไม่สำเร็จ");
  }
}
