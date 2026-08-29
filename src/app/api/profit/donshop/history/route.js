import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { donshopHistoryFeed } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const history = await donshopHistoryFeed();
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติ Donshop ไม่สำเร็จ");
  }
}
