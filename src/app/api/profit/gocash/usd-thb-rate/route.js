import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { ensureUsdThbRate } from "@/server/profit-aggregate";

// Plain USD->THB spot rate, auto-refreshed from exchangerate-api.com when
// stale (see ensureUsdThbRate). This is one of two factors behind GoCash's
// cost -- see /api/profit/gocash/rate for the other (GoCash's own deal rate).
export async function GET(request) {
  try {
    await requireProfitAccess(request);
    return jsonOk(await ensureUsdThbRate());
  } catch (err) {
    return handleApiError(err, "โหลดอัตราแลกเปลี่ยนไม่สำเร็จ");
  }
}
