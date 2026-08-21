import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { setGamelistFavorite } from "@/server/gameinfo-gamelist-favorites";

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoAccess(request);
    const { id } = await params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId <= 0) {
      const error = new Error("รหัสเกมไม่ถูกต้อง");
      error.status = 400;
      throw error;
    }
    const body = await request.json();
    return jsonOk({ favorite: await setGamelistFavorite(user.id, gameId, body.favorite) });
  } catch (error) {
    return handleApiError(error, "บันทึกรายการโปรดไม่สำเร็จ");
  }
}
