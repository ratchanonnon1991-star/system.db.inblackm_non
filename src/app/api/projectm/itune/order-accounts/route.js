import { requireSuperAdmin } from "@/server/auth";
import { listOrderAccounts, saveOrderAccount } from "@/server/itune-order-usage";
import { jsonOk, handleApiError } from "@/lib/http";
export async function GET(request) {
  try { await requireSuperAdmin(request); return jsonOk({ accounts: await listOrderAccounts() }); }
  catch (err) { return handleApiError(err, "โหลดบัญชีไม่สำเร็จ"); }
}
export async function PUT(request) {
  try { const actor = await requireSuperAdmin(request); await saveOrderAccount(await request.json(), actor); return jsonOk({ ok: true }); }
  catch (err) { return handleApiError(err, "บันทึกบัญชีไม่สำเร็จ"); }
}
