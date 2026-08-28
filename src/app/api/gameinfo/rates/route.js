import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { getGameinfoExchangeRates, normalizeGameinfoRatePair } from "@/server/gameinfo-exchange-rates";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const rawPairs = request.nextUrl.searchParams.get("pairs") || "USDTTHB,USDCNY";
    const requested = rawPairs.split(",");
    const unsupported = requested.filter((pair) => !normalizeGameinfoRatePair(pair));
    if (unsupported.length) return jsonError(`ไม่รองรับคู่สกุลเงิน: ${unsupported.join(", ")}`, 400);
    const force = request.nextUrl.searchParams.get("refresh") === "1";
    return jsonOk({ rates: await getGameinfoExchangeRates(requested, { force }) });
  } catch (error) {
    return handleApiError(error, "โหลดอัตราแลกเปลี่ยนไม่สำเร็จ");
  }
}
