import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { deleteOrder, updateOrder } from "@/server/profit-repository";

export async function PATCH(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { orderId } = await params;
    const body = await request.json();
    const order = await updateOrder(orderId, body);
    if (!order) return jsonError("ไม่พบออเดอร์นี้", 404);
    return jsonOk({ order });
  } catch (err) {
    return handleApiError(err, "แก้ไขออเดอร์ไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { orderId } = await params;
    await deleteOrder(orderId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบออเดอร์ไม่สำเร็จ");
  }
}
