import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { getGamelistPublishers, saveGamelistPublishers } from "@/server/gameinfo-gamelist-tags";
import { auditActor, recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const { id } = await params;
    return jsonOk({ publishers: await getGamelistPublishers(Number(id)) });
  } catch (error) {
    return handleApiError(error, "โหลดค่ายเกมไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    const before = await getGamelistPublishers(Number(id));
    const publishers = await saveGamelistPublishers(Number(id), body.publishers);
    await recordGameinfoAudit({ gameId: Number(id), area: "publishers", actor: auditActor(user), before: { publishers: before }, after: { publishers } });
    return jsonOk({ publishers });
  } catch (error) {
    return handleApiError(error, "บันทึกค่ายเกมไม่สำเร็จ");
  }
}
