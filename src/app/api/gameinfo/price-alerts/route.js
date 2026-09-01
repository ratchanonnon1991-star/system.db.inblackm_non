import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoMarketChecker } from "@/server/auth";
import { acknowledgeGameinfoPriceAlert, listGameinfoPriceAlerts, recalculateGameinfoPriceAlerts, unacknowledgeGameinfoPriceAlert } from "@/server/gameinfo-market-system";

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

// Re-compares the stored market offers against the GameInfo prices as they are
// right now. No market is called, so this is the cheap way to catch alerts up
// after a price edit.
export async function POST(request) {
  try {
    await requireGameinfoMarketChecker(request);
    const q = request.nextUrl.searchParams;
    const result = await recalculateGameinfoPriceAlerts({
      market: q.get("market") || "", gameId: q.get("gameId") || 0, dataMode: q.get("mode") || "",
    });
    return jsonOk({ recalculated: result });
  } catch (error) {
    return handleApiError(error, "คำนวณ Alert ใหม่ไม่สำเร็จ");
  }
}

export async function PATCH(request) {
  try {
    const user = await requireGameinfoMarketChecker(request);
    const body = await request.json();
    if (body.action === "unacknowledge") {
      return jsonOk({ alert: await unacknowledgeGameinfoPriceAlert(Number(body.id), user) });
    }
    return jsonOk({ alert: await acknowledgeGameinfoPriceAlert(Number(body.id), body.note, user) });
  } catch (error) {
    return handleApiError(error, "อัปเดตสถานะรับทราบ Alert ไม่สำเร็จ");
  }
}
