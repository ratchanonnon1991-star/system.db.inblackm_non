import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { platformSummary } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    return jsonOk(await platformSummary());
  } catch (err) {
    return handleApiError(err, "โหลดภาพรวมแพลตฟอร์มไม่สำเร็จ");
  }
}
