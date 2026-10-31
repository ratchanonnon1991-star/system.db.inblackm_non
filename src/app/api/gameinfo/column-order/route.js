import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { saveGameinfoColumnOrder } from "@/server/gameinfo-column-order";

// An admin decision about how everyone's table starts out.
export async function PUT(request) {
  try {
    await requireGameinfoEditor(request);
    const body = await request.json();
    const gameId = Number(body?.gameId) || 0;
    if (!Number.isSafeInteger(gameId) || gameId < 0) return jsonError("gameId ไม่ถูกต้อง", 400);
    if (!Array.isArray(body?.columnIds)) return jsonError("รายการคอลัมน์ไม่ถูกต้อง", 400);
    return jsonOk({ orders: await saveGameinfoColumnOrder({ gameId, columnIds: body.columnIds }) });
  } catch (error) {
    return handleApiError(error, "บันทึกลำดับคอลัมน์ไม่สำเร็จ");
  }
}
