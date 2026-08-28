import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { setOxideMergeCleared } from "@/server/profit-repository";

export async function PATCH(request, { params }) {
  try {
    const user = await requireProfitEditor(request);
    const { cardId } = await params;
    const body = await request.json();
    const mark = await setOxideMergeCleared(cardId, Boolean(body.cleared), user);
    return jsonOk({ mark });
  } catch (err) {
    return handleApiError(err, "อัปเดตสถานะรวมบัตรไม่สำเร็จ");
  }
}
