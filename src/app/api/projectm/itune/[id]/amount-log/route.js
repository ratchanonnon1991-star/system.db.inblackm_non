import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmTopup } from "@/server/auth";
import { findItuneEntryById, listItuneAmountLog } from "@/server/itune-entries-repository";

// Read side for the amount-adjustment history shown inside an expanded
// topup card (see itune-topup-card.js).
export async function GET(request, { params }) {
  try {
    const actor = await requireProjectmTopup(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const logs = await listItuneAmountLog(id, actor);
    return jsonOk({ logs });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติยอดไม่สำเร็จ");
  }
}
