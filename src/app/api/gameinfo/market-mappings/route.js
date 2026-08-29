import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import {
  deleteAllGameinfoMarketMappings,
  deleteGameinfoMarketMapping,
  getGameinfoMappingWorkspace,
  listGameinfoMarketMappings,
  saveGameinfoMarketMapping,
  saveGameinfoMarketMappingsInOrder,
} from "@/server/gameinfo-market-system";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const q = request.nextUrl.searchParams;
    const gameId = Number(q.get("gameId"));
    const mode = q.get("mode") || "uid";
    const market = q.get("market") || "kaleoz";
    if (q.get("workspace") === "1") {
      const workspace = await getGameinfoMappingWorkspace(gameId, mode, market, {
        query: q.get("query") || "", status: q.get("status") || "all", page: q.get("page") || 1,
      });
      return jsonOk({ workspace });
    }
    return jsonOk({ mappings: await listGameinfoMarketMappings(gameId, mode, market) });
  } catch (error) {
    return handleApiError(error, "โหลด Mapping ไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const input = await request.json();
    if (Array.isArray(input?.pairs)) {
      return jsonOk(await saveGameinfoMarketMappingsInOrder(input, user));
    }
    return jsonOk({ mapping: await saveGameinfoMarketMapping(input, user) });
  } catch (error) {
    return handleApiError(error, "บันทึก Mapping ไม่สำเร็จ");
  }
}

export async function DELETE(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const input = await request.json();
    if (input?.all === true) return jsonOk(await deleteAllGameinfoMarketMappings(input, user));
    return jsonOk(await deleteGameinfoMarketMapping(input, user));
  } catch (error) {
    return handleApiError(error, "ยกเลิก Mapping ไม่สำเร็จ");
  }
}
