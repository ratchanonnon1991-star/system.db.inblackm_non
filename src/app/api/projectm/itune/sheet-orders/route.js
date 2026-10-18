import { requireProjectmAdmin } from "@/server/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { getSheetOverview, setCostRate } from "@/server/itune-sheet-orders";

export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
    const response = jsonOk(await getSheetOverview()); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (err) { return handleApiError(err, "โหลดข้อมูลออเดอร์จากชีทไม่สำเร็จ"); }
}

export async function POST(request) {
  try {
    const actor = await requireProjectmAdmin(request);
    const body = await request.json().catch(() => null);
    if (body?.action !== "rate") return jsonError("คำสั่งไม่ถูกต้อง", 400);
    return jsonOk({ rate: await setCostRate(body, actor) });
  } catch (err) { return handleApiError(err, "บันทึกต้นทุนไม่สำเร็จ"); }
}
