import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import {
  getGameinfoMarketGameOptions,
  listGameinfoGameMarkets,
  saveGameinfoGameMarket,
} from "@/server/gameinfo-market-system";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const gameId = Number((await params).gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return jsonError("gameId ไม่ถูกต้อง");
    const mode = request.nextUrl.searchParams.get("mode") || "uid";
    const market = request.nextUrl.searchParams.get("market");
    const [markets, marketGames] = await Promise.all([
      listGameinfoGameMarkets(gameId, mode),
      market ? getGameinfoMarketGameOptions(market) : [],
    ]);
    return jsonOk({ markets, marketGames });
  } catch (error) {
    return handleApiError(error, "โหลดการตั้งค่า Market ไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const gameId = Number((await params).gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return jsonError("gameId ไม่ถูกต้อง");
    const body = await request.json();
    const market = await saveGameinfoGameMarket(gameId, body.dataMode || "uid", body.market, body, user);
    return jsonOk({ market });
  } catch (error) {
    return handleApiError(error, "บันทึกการตั้งค่า Market ไม่สำเร็จ");
  }
}
