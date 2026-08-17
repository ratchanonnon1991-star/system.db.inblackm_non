import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { setGameListServiceStatus } from "@/server/gameinfo-gamelist";

export async function POST(request) {
  try {
    await requireLayoutEditor(request);
    const body = await request.json();
    if (!Array.isArray(body?.gameIds) || typeof body?.enabled !== "boolean") {
      return jsonError("รูปแบบสถานะเกมไม่ถูกต้อง", 400);
    }
    return jsonOk(await setGameListServiceStatus(body.gameIds, body.enabled));
  } catch (error) {
    return handleApiError(error, "เปลี่ยนสถานะเกมไม่สำเร็จ");
  }
}
