import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { setGocashOverride } from "@/server/profit-repository";

// Manual platform tag is only relevant when codashop_orders.source has none
// for this order (see gocashOrderView in profit-aggregate.js) -- the sale
// price then falls back live to that platform's reference price on every
// read, so there's no separate "pull the price now" step needed here.
export async function PATCH(request, { params }) {
  try {
    const user = await requireProfitEditor(request);
    const { historyId } = await params;
    const body = await request.json();
    const override = await setGocashOverride(historyId, body, user);
    return jsonOk({ override });
  } catch (err) {
    return handleApiError(err, "แก้ไขยอดขาย/ต้นทุนไม่สำเร็จ");
  }
}
