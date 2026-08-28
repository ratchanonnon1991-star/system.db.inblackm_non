import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { setOxideOverride } from "@/server/profit-repository";

// Same convention as the GoCash history PATCH route: manual platform tag
// only matters when codashop_orders.source has none for this order (see
// oxideOrderView in profit-aggregate.js) -- sale then falls back live to
// that platform's reference price on every read.
export async function PATCH(request, { params }) {
  try {
    const user = await requireProfitEditor(request);
    const { orderId } = await params;
    const body = await request.json();
    const override = await setOxideOverride(orderId, body, user);
    return jsonOk({ override });
  } catch (err) {
    return handleApiError(err, "แก้ไขยอดขาย/ต้นทุนไม่สำเร็จ");
  }
}
