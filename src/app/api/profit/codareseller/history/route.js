import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { codaresellerHistoryFeed } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const history = await codaresellerHistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ Codareseller ไม่สำเร็จ");
  }
}
