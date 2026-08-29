import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { u9HistoryFeed } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const history = await u9HistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ U9 ไม่สำเร็จ");
  }
}
