import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockAccess, requireStockEditor } from "@/server/auth";
import { listPendingStockOrders, skipStockOrder, unskipStockOrder } from "@/server/stock-pending-orders";

export async function GET(request) {
  try {
    await requireStockAccess(request);
    return jsonOk(await listPendingStockOrders({ days: request.nextUrl.searchParams.get("days") }));
  } catch (error) {
    return handleApiError(error, "โหลดรายการรอตัดไม่สำเร็จ");
  }
}

/** { ref, game, pack } → marked "ไม่ได้ใช้ stock". */
export async function POST(request) {
  try {
    const user = await requireStockEditor(request);
    const body = await request.json();
    await skipStockOrder(body, { id: user.id, name: user.displayName || user.username });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error, "บันทึกไม่สำเร็จ");
  }
}

/** ?ref= → back on รอตัด. */
export async function DELETE(request) {
  try {
    await requireStockEditor(request);
    await unskipStockOrder(request.nextUrl.searchParams.get("ref"));
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error, "บันทึกไม่สำเร็จ");
  }
}
