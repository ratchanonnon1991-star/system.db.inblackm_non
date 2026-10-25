import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { fillGamesFromTopupWeb } from "@/server/gameinfo-topup-import";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const body = await request.json();
    return jsonOk(await fillGamesFromTopupWeb(body.gameIds, {
      image: body.image === true,
      tags: body.tags === true,
      packs: body.packs === true,
    }, auditActor(user)));
  } catch (error) {
    return handleApiError(error, "ดึงข้อมูลจากเว็บไม่สำเร็จ");
  }
}
