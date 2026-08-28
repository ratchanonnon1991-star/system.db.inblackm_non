import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { clearGameinfoBaselineSeller, saveGameinfoBaselineSeller } from "@/server/gameinfo-market-preferences";

export async function PUT(request) {
  try {
    const user = await requireGameinfoAccess(request);
    const body = await request.json();
    const baselineSeller = await saveGameinfoBaselineSeller(user.id, body.provider, body.game, body.seller);
    return jsonOk({ baselineSeller });
  } catch (error) {
    return handleApiError(error, "บันทึก Seller อ้างอิงไม่สำเร็จ");
  }
}

export async function DELETE(request) {
  try {
    const user = await requireGameinfoAccess(request);
    const body = await request.json();
    const baselineSeller = await clearGameinfoBaselineSeller(user.id, body.provider, body.game);
    return jsonOk({ baselineSeller });
  } catch (error) {
    return handleApiError(error, "ล้าง Seller อ้างอิงไม่สำเร็จ");
  }
}
