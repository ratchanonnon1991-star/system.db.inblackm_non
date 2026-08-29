import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { getGameinfoPackPriceComparison } from "@/server/gameinfo-market-system";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const q = request.nextUrl.searchParams;
    const comparison = await getGameinfoPackPriceComparison({
      gameId: Number(q.get("gameId")), dataMode: q.get("mode") || "uid",
      market: q.get("market") || "kaleoz", page: q.get("page") || 1,
      sellers: q.getAll("seller"),
    });
    return jsonOk({ comparison });
  } catch (error) {
    return handleApiError(error, "โหลดข้อมูลเทียบราคาไม่สำเร็จ");
  }
}
