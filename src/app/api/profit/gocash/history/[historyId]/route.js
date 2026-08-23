import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { setGocashOverride } from "@/server/profit-repository";

export async function PATCH(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { historyId } = await params;
    const body = await request.json();
    const override = await setGocashOverride(historyId, body);
    return jsonOk({ override });
  } catch (err) {
    return handleApiError(err, "แก้ไขยอดขาย/ต้นทุนไม่สำเร็จ");
  }
}
