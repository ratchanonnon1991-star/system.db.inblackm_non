import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { neteaseHistoryFeed } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const history = await neteaseHistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ Netease ไม่สำเร็จ");
  }
}
