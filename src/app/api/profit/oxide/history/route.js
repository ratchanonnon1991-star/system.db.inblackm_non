import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { oxideHistoryFeed } from "@/server/profit-aggregate";

// Multi Game Card rows are 100% read-only from codashop_orders — no overlay.
export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const history = await oxideHistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ Multi Game Card ไม่สำเร็จ");
  }
}
