import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { linkGamesToTopupWeb } from "@/server/gameinfo-topup-import";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const { links } = await request.json();
    return jsonOk(await linkGamesToTopupWeb(links, auditActor(user)));
  } catch (error) {
    return handleApiError(error, "เชื่อมเกมกับเว็บไม่สำเร็จ");
  }
}
