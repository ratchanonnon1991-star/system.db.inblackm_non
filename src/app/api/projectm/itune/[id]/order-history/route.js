import { requireProjectmTopup } from "@/server/auth";
import { entryOrderHistory } from "@/server/itune-order-usage";
import { jsonOk, handleApiError } from "@/lib/http";
export async function GET(request, { params }) {
  try { const actor = await requireProjectmTopup(request); const { id } = await params; return jsonOk({ history: await entryOrderHistory(id, actor) }); }
  catch (err) { return handleApiError(err, "โหลดประวัติ Order ไม่สำเร็จ"); }
}
