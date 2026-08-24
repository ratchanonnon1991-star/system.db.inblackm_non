import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { resetAllCosts } from "@/server/profit-repository";

export async function POST(request) {
  try {
    await requireProfitEditor(request);
    await resetAllCosts();
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ล้างค่าต้นทุนไม่สำเร็จ");
  }
}
