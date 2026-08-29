import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { setDonshopOverride } from "@/server/profit-repository";

export async function PATCH(request, { params }) {
  try {
    const user = await requireProfitEditor(request);
    const { orderId } = await params;
    const body = await request.json();
    const override = await setDonshopOverride(orderId, body, user);
    return jsonOk({ override });
  } catch (err) {
    return handleApiError(err, "แก้ไขยอดขาย/ต้นทุนไม่สำเร็จ");
  }
}
