import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import { getAllPlatformFees, isPlatformFeeLocked, setPlatformFee } from "@/server/profit-repository";

// Marketplace commission (%) a platform (Kaleoz, ...) takes off the listed
// sale price -- feeds GoCash's profit calc (see gocashOrderView). Same
// query-param-not-route-segment pattern as /api/profit/sale-prices.
export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const platform = request.nextUrl.searchParams.get("platform");
    if (!platform) return jsonError("กรุณาระบุแพลตฟอร์ม", 400);
    const fees = await getAllPlatformFees();
    return jsonOk({ platform, feePct: fees[platform] || 0, locked: isPlatformFeeLocked(platform) });
  } catch (err) {
    return handleApiError(err, "โหลดค่าธรรมเนียมไม่สำเร็จ");
  }
}

export async function PATCH(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json();
    const feePct = await setPlatformFee(body.platform, body.feePct);
    return jsonOk({ platform: body.platform, feePct });
  } catch (err) {
    return handleApiError(err, "ตั้งค่าธรรมเนียมไม่สำเร็จ");
  }
}
