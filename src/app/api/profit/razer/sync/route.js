import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { syncAllRazerAccounts } from "@/server/profit-razer-sync";

export async function POST(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json().catch(() => ({}));
    const result = await syncAllRazerAccounts({ zone: body.zone || undefined });
    return jsonOk({ result });
  } catch (err) {
    return handleApiError(err, "ดึงยอด Razer ทั้งหมดไม่สำเร็จ");
  }
}
