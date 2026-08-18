import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findItuneEntryById, listItuneAmountLog } from "@/server/itune-entries-repository";

// Read side for the amount-adjustment history shown inside an expanded
// topup card (see itune-topup-card.js).
export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const logs = await listItuneAmountLog(id);
    return jsonOk({ logs });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติยอดไม่สำเร็จ");
  }
}
