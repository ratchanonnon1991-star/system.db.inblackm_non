import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { listRussiaCheckLogs } from "@/server/gameinfo-russia-check";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const query = request.nextUrl.searchParams;
    return jsonOk(await listRussiaCheckLogs({ gameId: query.get("gameId"), eventType: query.get("eventType"), cursor: query.get("cursor"), limit: query.get("limit") }));
  } catch (error) {
    return handleApiError(error, "โหลด Log Russia Check ไม่สำเร็จ");
  }
}
