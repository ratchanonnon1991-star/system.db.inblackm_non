import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import { packCostSummary } from "@/server/profit-aggregate";
import { setPackCost } from "@/server/profit-repository";

export async function GET(request) {
  try {
    await requireProfitAccess(request);
    return jsonOk({ packs: await packCostSummary() });
  } catch (err) {
    return handleApiError(err, "โหลดต้นทุนตามแพ็กไม่สำเร็จ");
  }
}

export async function PATCH(request) {
  try {
    const user = await requireProfitEditor(request);
    const body = await request.json();
    const cost = await setPackCost(body.source, body.packName, body.cost, body.expected, user);
    return jsonOk({ source: body.source, packName: body.packName, cost });
  } catch (err) {
    return handleApiError(err, "ตั้งต้นทุนไม่สำเร็จ");
  }
}
