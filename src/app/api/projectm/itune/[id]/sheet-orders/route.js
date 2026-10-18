import { requireProjectmAccess } from "@/server/auth";
import { handleApiError, jsonOk } from "@/lib/http";
import { addManualOrder, entrySheetOrders } from "@/server/itune-sheet-orders";

// Admins: any email. Topup: only the email they hold (checked in the repository).
export async function GET(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request); const { id } = await params;
    const response = jsonOk(await entrySheetOrders(id, actor)); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (err) { return handleApiError(err, "โหลดออเดอร์จากชีทไม่สำเร็จ"); }
}

// Add an order by hand: deducts the email like a sheet import.
export async function POST(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request); const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return jsonOk(await addManualOrder({ ...body, entryId: id }, actor), 201);
  } catch (err) { return handleApiError(err, "เพิ่มออเดอร์ไม่สำเร็จ"); }
}
