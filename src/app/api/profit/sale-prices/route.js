import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import { platformPackPrices } from "@/server/profit-aggregate";
import { setPlatformPrice } from "@/server/profit-repository";

// Platform is passed as a query param / JSON body field rather than a route
// segment on purpose -- see the dust-clear card-id bug this project already
// hit once from double-encoding a colon in a dynamic route param.
export async function GET(request) {
  try {
    await requireProfitAccess(request);
    const platform = request.nextUrl.searchParams.get("platform");
    if (!platform) return jsonError("กรุณาระบุแพลตฟอร์ม", 400);
    return jsonOk({ packs: await platformPackPrices(platform) });
  } catch (err) {
    return handleApiError(err, "โหลดราคาขายไม่สำเร็จ");
  }
}

export async function PATCH(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json();
    const price = await setPlatformPrice(body.platform, body.source, body.packName, body.price);
    return jsonOk({ platform: body.platform, source: body.source, packName: body.packName, price });
  } catch (err) {
    return handleApiError(err, "ตั้งราคาขายไม่สำเร็จ");
  }
}
