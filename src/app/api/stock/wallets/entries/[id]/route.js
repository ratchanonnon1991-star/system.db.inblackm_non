import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockEditor } from "@/server/auth";
import { setWalletPaymentStatus } from "@/server/stock-wallet-repository";

// { status: "pending" | "done" } for a payment not tied to a purchase order.
export async function PATCH(request, { params }) {
  try {
    await requireStockEditor(request);
    const { id } = await params;
    const body = await request.json();
    return jsonOk({ entryId: await setWalletPaymentStatus(id, body?.status) });
  } catch (error) {
    return handleApiError(error, "แก้สถานะรายการไม่สำเร็จ");
  }
}
