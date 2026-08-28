import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { wavepayHistoryFeed } from "@/server/profit-aggregate";

// WavePay rows are 100% read-only from codashop_orders — no overlay.
export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const history = await wavepayHistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ Wavepay ไม่สำเร็จ");
  }
}
