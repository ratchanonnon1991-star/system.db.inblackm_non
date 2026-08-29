import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoMarketChecker } from "@/server/auth";
import { acknowledgeGameinfoPriceAlert, listGameinfoPriceAlerts } from "@/server/gameinfo-market-system";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const q = request.nextUrl.searchParams;
    return jsonOk({ alerts: await listGameinfoPriceAlerts({
      market: q.get("market") || "", gameId: q.get("gameId") || "",
      dataMode: q.get("mode") || "", status: q.get("status") || "active",
      direction: q.get("direction") || "", seller: q.get("seller") || "",
      page: q.get("page") || 1,
    }) });
  } catch (error) {
    return handleApiError(error, "โหลด Alert ไม่สำเร็จ");
  }
}

export async function PATCH(request) {
  try {
    const user = await requireGameinfoMarketChecker(request);
    const body = await request.json();
    return jsonOk({ alert: await acknowledgeGameinfoPriceAlert(Number(body.id), body.note, user) });
  } catch (error) {
    return handleApiError(error, "รับทราบ Alert ไม่สำเร็จ");
  }
}
