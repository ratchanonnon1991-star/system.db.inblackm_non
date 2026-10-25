import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { importTopupWebGames } from "@/server/gameinfo-topup-import";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const { topupGameIds } = await request.json();
    return jsonOk(await importTopupWebGames(topupGameIds, auditActor(user)));
  } catch (error) {
    return handleApiError(error, "นำเข้าเกมจากเว็บไม่สำเร็จ");
  }
}
