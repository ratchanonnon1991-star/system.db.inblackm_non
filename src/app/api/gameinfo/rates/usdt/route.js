import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { getUsdtThbRate } from "@/server/gameinfo-usdt-rate";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const rate = await getUsdtThbRate();
    return jsonOk(rate);
  } catch (error) {
    return handleApiError(error, "โหลดราคา USDT ไม่สำเร็จ");
  }
}
