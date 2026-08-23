import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { setDustCleared } from "@/server/profit-repository";

export async function PATCH(request, { params }) {
  try {
    const user = await requireProfitEditor(request);
    const { cardId } = await params;
    const body = await request.json();
    const mark = await setDustCleared(cardId, Boolean(body.cleared), user);
    return jsonOk({ mark });
  } catch (err) {
    return handleApiError(err, "อัปเดตสถานะเคลียเศษไม่สำเร็จ");
  }
}
