import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { setWalletPaymentStatus } from "@/server/stock-wallet-repository";

// { status: "pending" | "done", reason } for a payment not tied to a purchase order.
// done → pending only becomes a request that someone else confirms (…/status).
export async function PATCH(request, { params }) {
  try {
    const user = await requireStockEditor(request);
    const { id } = await params;
    const body = await request.json();
    const result = await setWalletPaymentStatus(id, body?.status, { id: user.id, name: user.displayName || user.username }, body?.reason);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error, "แก้สถานะรายการไม่สำเร็จ");
  }
}
