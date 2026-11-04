import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { saveGamelistGameSettings } from "@/server/gameinfo-game-settings";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    const patch = {};
    if (Object.hasOwn(body, "topupGameId")) patch.topupGameId = body.topupGameId;
    if (Object.hasOwn(body, "sourceUid")) patch.sourceUid = body.sourceUid;
    if (Object.hasOwn(body, "sourceIdpass")) patch.sourceIdpass = body.sourceIdpass;
    if (Object.hasOwn(body, "priceChannels")) patch.priceChannels = body.priceChannels;
    return jsonOk({ settings: await saveGamelistGameSettings(Number(id), patch, auditActor(user)) });
  } catch (error) {
    return handleApiError(error, "บันทึกการตั้งค่าเกมไม่สำเร็จ");
  }
}
