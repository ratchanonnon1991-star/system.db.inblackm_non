import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { resetPlatformPrices } from "@/server/profit-repository";

// Clears every reference price for one platform -- scoped per-platform (not
// global) since sale prices are inherently platform-specific, unlike costs.
export async function POST(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json();
    if (!body.platform) return jsonError("กรุณาระบุแพลตฟอร์ม", 400);
    await resetPlatformPrices(body.platform);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "รีเซ็ตราคาขายไม่สำเร็จ");
  }
}
