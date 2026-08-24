import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { syncUsdThbRateFromApi } from "@/server/profit-aggregate";

// Force-pulls a fresh USD->THB rate from exchangerate-api.com regardless of
// staleness -- the "ซิงค์จาก API" button, for right after setting/rotating
// the API key or whenever staff want the freshest number without waiting out
// the cache.
export async function POST(request) {
  try {
    await requireProfitEditor(request);
    return jsonOk(await syncUsdThbRateFromApi());
  } catch (err) {
    return handleApiError(err, "ซิงค์อัตราแลกเปลี่ยนไม่สำเร็จ");
  }
}
