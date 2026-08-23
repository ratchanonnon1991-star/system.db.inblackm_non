import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { categorySummaries } from "@/server/profit-aggregate";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    return jsonOk({ categories: await categorySummaries() });
  } catch (err) {
    return handleApiError(err, "โหลดหมวดหมู่ไม่สำเร็จ");
  }
}
