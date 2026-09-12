import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { getRussiaCheckDashboard } from "@/server/gameinfo-russia-check";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const query = request.nextUrl.searchParams;
    return jsonOk(await getRussiaCheckDashboard({ gameId: query.get("gameId"), status: query.get("status") || "" }));
  } catch (error) {
    return handleApiError(error, "โหลด Russia Check ไม่สำเร็จ");
  }
}
