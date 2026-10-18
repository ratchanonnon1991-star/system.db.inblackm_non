import { requireProjectmAccess } from "@/server/auth";
import { handleApiError, jsonOk } from "@/lib/http";
import { deleteSheetOrder, updateSheetOrderAmount } from "@/server/itune-sheet-orders";

// Emergency fix of the amount out: the email moves by the difference; kept as edit history.
export async function PATCH(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request); const { orderId } = await params;
    const body = await request.json().catch(() => ({}));
    return jsonOk(await updateSheetOrderAmount(orderId, body, actor));
  } catch (err) { return handleApiError(err, "แก้ยอดออกไม่สำเร็จ"); }
}

// Deleting returns the amount to the email and keeps the order as deletion history.
export async function DELETE(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request); const { orderId } = await params;
    await deleteSheetOrder(orderId, actor); return jsonOk({ ok: true });
  } catch (err) { return handleApiError(err, "ลบออเดอร์ไม่สำเร็จ"); }
}
