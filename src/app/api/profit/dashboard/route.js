import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { dashboardSummary } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    return jsonOk({ dashboard: await dashboardSummary() });
  } catch (err) {
    return handleApiError(err, "โหลดภาพรวมไม่สำเร็จ");
  }
}
