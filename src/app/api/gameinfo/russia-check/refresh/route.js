import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoMarketChecker } from "@/server/auth";
import { startRussiaCheck } from "@/server/gameinfo-russia-check";

export async function POST(request) {
  try {
    const user = await requireGameinfoMarketChecker(request);
    const body = await request.json().catch(() => ({}));
    return jsonOk(await startRussiaCheck(user, "manual", body.gameId), 202);
  } catch (error) {
    return handleApiError(error, "เริ่ม Russia Check ไม่สำเร็จ");
  }
}
