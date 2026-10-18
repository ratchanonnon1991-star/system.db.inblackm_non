import { requireProjectmAccess } from "@/server/auth";
import { handleApiError, jsonOk } from "@/lib/http";
import { deleteSheetOrder } from "@/server/itune-sheet-orders";

// Deleting returns the amount to the email and keeps the order as deletion history.
export async function DELETE(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request); const { orderId } = await params;
    await deleteSheetOrder(orderId, actor); return jsonOk({ ok: true });
  } catch (err) { return handleApiError(err, "ลบออเดอร์ไม่สำเร็จ"); }
}
