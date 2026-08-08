import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { reorderGameListRows } from "@/server/gameinfo-gamelist";

export async function POST(request) {
  try {
    await requireLayoutEditor(request);
    const body = await request.json();
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(Number) : [];
    if (!orderedIds.length) return jsonError("ไม่มีลำดับที่จะบันทึก", 400);
    await reorderGameListRows(orderedIds);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "บันทึกลำดับไม่สำเร็จ");
  }
}
