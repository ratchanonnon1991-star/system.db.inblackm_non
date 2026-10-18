import { requireProjectmAccess } from "@/server/auth";
import { handleApiError, jsonOk } from "@/lib/http";
import { entrySheetOrders } from "@/server/itune-sheet-orders";

// Admins: any email. Topup: only the email they hold (checked in entrySheetOrders).
export async function GET(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request); const { id } = await params;
    return jsonOk({ orders: await entrySheetOrders(id, actor) });
  } catch (err) { return handleApiError(err, "โหลดออเดอร์จากชีทไม่สำเร็จ"); }
}
