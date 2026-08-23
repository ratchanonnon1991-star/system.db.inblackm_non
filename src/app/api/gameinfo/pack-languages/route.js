import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import {
  createGamelistPackLanguage,
  listGamelistPackLanguages,
} from "@/server/gameinfo-gamelist-packs";
import { auditActor, recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    return jsonOk({ languages: await listGamelistPackLanguages() });
  } catch (error) {
    return handleApiError(error, "โหลดรายการภาษาไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const body = await request.json();
    const language = await createGamelistPackLanguage(body.name, user.id);
    await recordGameinfoAudit({ gameId: 0, area: "settings", action: "create", actor: auditActor(user), after: { language: language.name } });
    return jsonOk({ language }, 201);
  } catch (error) {
    return handleApiError(error, "เพิ่มภาษาไม่สำเร็จ");
  }
}
