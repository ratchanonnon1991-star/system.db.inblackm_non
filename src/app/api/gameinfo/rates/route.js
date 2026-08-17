import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { getGameinfoExchangeRates, normalizeGameinfoRatePair } from "@/server/gameinfo-exchange-rates";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const rawPairs = request.nextUrl.searchParams.get("pairs") || "USDTTHB,CNYTHB";
    const requested = rawPairs.split(",");
    const unsupported = requested.filter((pair) => !normalizeGameinfoRatePair(pair));
    if (unsupported.length) return jsonError(`ไม่รองรับคู่สกุลเงิน: ${unsupported.join(", ")}`, 400);
    return jsonOk({ rates: await getGameinfoExchangeRates(requested) });
  } catch (error) {
    return handleApiError(error, "โหลดอัตราแลกเปลี่ยนไม่สำเร็จ");
  }
}
