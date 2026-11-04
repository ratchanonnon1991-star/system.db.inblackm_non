import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { linkWalletPaymentToOrder } from "@/server/stock-purchase-order-repository";

// { orderId } ties a payment already in a wallet to an order waiting for money ("รอโอนเงิน").
export async function POST(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    const body = await request.json();
    const order = await linkWalletPaymentToOrder(id, body?.orderId, { id: user.id, name: user.displayName || user.username });
    return jsonOk({ order });
  } catch (error) {
    return handleApiError(error, "ผูกรายการจ่ายกับใบสั่งซื้อไม่สำเร็จ");
  }
}
