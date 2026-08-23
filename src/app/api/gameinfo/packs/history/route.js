import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { listAllGamelistPackAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    const searchParams = new URL(request.url).searchParams;
    const limit = Number(searchParams.get("limit") || 1000);
    return jsonOk({ history: await listAllGamelistPackAudit(limit, {
      area: searchParams.get("area"),
      gameId: searchParams.get("gameId"),
      dataMode: searchParams.get("mode"),
    }) });
  } catch (error) {
    return handleApiError(error, "โหลดประวัติการแก้ไขรวมไม่สำเร็จ");
  }
}
