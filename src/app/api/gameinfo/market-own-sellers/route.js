import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { listGameinfoOwnSellers, saveGameinfoOwnSellers } from "@/server/gameinfo-market-system";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ sellers: await listGameinfoOwnSellers(request.nextUrl.searchParams.get("market") || "") });
  } catch (error) {
    return handleApiError(error, "โหลดร้านของเราไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const body = await request.json();
    return jsonOk({ sellers: await saveGameinfoOwnSellers(body.market, body.sellers, user) });
  } catch (error) {
    return handleApiError(error, "บันทึกร้านของเราไม่สำเร็จ");
  }
}
