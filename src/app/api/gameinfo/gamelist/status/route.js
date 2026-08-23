import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { setGameListServiceStatus } from "@/server/gameinfo-gamelist";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const body = await request.json();
    if (
      !Array.isArray(body?.gameIds) ||
      typeof body?.enabled !== "boolean"
    ) {
      return jsonError("รูปแบบสถานะเกมไม่ถูกต้อง", 400);
    }
    return jsonOk(await setGameListServiceStatus(body.gameIds, body.enabled, auditActor(user)));
  } catch (error) {
    return handleApiError(error, "เปลี่ยนสถานะเกมไม่สำเร็จ");
  }
}
