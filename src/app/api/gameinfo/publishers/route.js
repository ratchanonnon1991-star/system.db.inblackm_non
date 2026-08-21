import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { listGamelistPublisherImages, saveGamelistPublisherImage } from "@/server/gameinfo-gamelist-tags";
import { auditActor, recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ images: await listGamelistPublisherImages() });
  } catch (error) {
    return handleApiError(error, "โหลดรูปค่ายเกมไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const body = await request.json();
    const before = (await listGamelistPublisherImages())[body.name] || "";
    const result = await saveGamelistPublisherImage(body.name, body.imageUrl);
    await recordGameinfoAudit({ gameId: 0, area: "settings", actor: auditActor(user), before: { publisher: body.name, image: Boolean(before) }, after: { publisher: result.name, image: Boolean(result.imageUrl) } });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error, "บันทึกรูปค่ายเกมไม่สำเร็จ");
  }
}
