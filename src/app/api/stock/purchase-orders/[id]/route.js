import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireStockAccess } from "@/server/auth";
import { getPurchaseOrder } from "@/server/stock-purchase-order-repository";

export async function GET(request, { params }) {
  try {
    await requireStockAccess(request);
    const { id } = await params;
    const order = await getPurchaseOrder(id);
    if (!order) return jsonError("ไม่พบใบสั่งซื้อนี้", 404);
    return jsonOk({ order });
  } catch (error) {
    return handleApiError(error, "โหลดใบสั่งซื้อไม่สำเร็จ");
  }
}
