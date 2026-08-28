import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { setWavepayOverride } from "@/server/profit-repository";

// Same convention as the Multi Game Card orders PATCH route: manual
// platform tag only matters when codashop_orders.telegram_task_request_id
// has no letter-prefix for this order (see wavepayOrderView in
// profit-aggregate.js) -- sale then falls back live to that platform's
// reference price on every read.
export async function PATCH(request, { params }) {
  try {
    const user = await requireProfitEditor(request);
    const { orderId } = await params;
    const body = await request.json();
    const override = await setWavepayOverride(orderId, body, user);
    return jsonOk({ override });
  } catch (err) {
    return handleApiError(err, "แก้ไขยอดขาย/ต้นทุนไม่สำเร็จ");
  }
}
