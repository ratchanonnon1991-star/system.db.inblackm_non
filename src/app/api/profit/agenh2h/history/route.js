import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { agenh2hHistoryFeed } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const history = await agenh2hHistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ Agenh2h ไม่สำเร็จ");
  }
}
