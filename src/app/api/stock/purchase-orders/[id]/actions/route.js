import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { takePurchaseOrderAction } from "@/server/stock-purchase-order-repository";

// One step on a purchase order: { action: "pay" | "receive" | "request_refund" | "refund" | "cancel", note, lines, refundAmount }.
export async function POST(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    const body = await request.json();
    const order = await takePurchaseOrderAction(id, String(body?.action || ""), body || {}, { id: user.id, name: user.displayName || user.username });
    return jsonOk({ order });
  } catch (error) {
    return handleApiError(error, "บันทึกขั้นตอนใบสั่งซื้อไม่สำเร็จ");
  }
}
