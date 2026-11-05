import { handleApiError, jsonOk } from "@/lib/http";
import { requireStockAccess, requireStockEditor } from "@/server/auth";
import { createPurchaseOrder, listPurchaseOrders } from "@/server/stock-purchase-order-repository";

export async function GET(request) {
  try {
    await requireStockAccess(request);
    const status = request.nextUrl.searchParams.get("status");
    return jsonOk({ orders: await listPurchaseOrders({ status }) });
  } catch (error) {
    return handleApiError(error, "โหลดใบสั่งซื้อไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireStockEditor(request);
    const order = await createPurchaseOrder(await request.json(), { id: user.id, name: user.displayName || user.username });
    return jsonOk({ order }, 201);
  } catch (error) {
    return handleApiError(error, "สร้างใบสั่งซื้อไม่สำเร็จ");
  }
}
