import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { reorderGameinfoGames } from "@/server/gameinfo-games";

export async function POST(request) {
  try {
    await requireLayoutEditor(request);
    const body = await request.json();
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (!orderedIds.length) return jsonError("ไม่มีลำดับที่จะบันทึก", 400);
    await reorderGameinfoGames(orderedIds);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "บันทึกลำดับไม่สำเร็จ");
  }
}
