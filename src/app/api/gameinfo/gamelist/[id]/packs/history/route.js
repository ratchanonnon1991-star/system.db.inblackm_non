import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { listGamelistPackAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId <= 0) return jsonError("gameId ไม่ถูกต้อง", 400);
    const limit = Number(new URL(request.url).searchParams.get("limit") || 100);
    const history = await listGamelistPackAudit(gameId, limit);
    return jsonOk({ history });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติการแก้ไขแพ็กไม่สำเร็จ");
  }
}
