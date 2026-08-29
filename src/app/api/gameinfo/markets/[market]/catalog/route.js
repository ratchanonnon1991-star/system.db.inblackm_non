import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { listGameinfoMarketCatalog } from "@/server/gameinfo-market-system";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const market = (await params).market;
    const q = request.nextUrl.searchParams;
    const catalog = await listGameinfoMarketCatalog({
      market,
      externalGameKey: q.get("externalGameKey") || "",
      gameId: q.get("gameId"),
      dataMode: q.get("mode") || "uid",
      query: q.get("query") || "",
      status: q.get("status") || "all",
      page: q.get("page") || 1,
      limit: q.get("limit") || 50,
    });
    return jsonOk({ catalog });
  } catch (error) {
    return handleApiError(error, "โหลด Catalog ไม่สำเร็จ");
  }
}
