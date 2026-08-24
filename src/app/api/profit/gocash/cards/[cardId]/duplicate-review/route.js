import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { setDuplicateReviewed } from "@/server/profit-repository";

export async function PATCH(request, { params }) {
  try {
    const user = await requireProfitEditor(request);
    const { cardId } = await params;
    const body = await request.json();
    const mark = await setDuplicateReviewed(cardId, Boolean(body.reviewed), user);
    return jsonOk({ mark });
  } catch (err) {
    return handleApiError(err, "อัปเดตสถานะตรวจสอบบัตรตัดซ้ำไม่สำเร็จ");
  }
}
