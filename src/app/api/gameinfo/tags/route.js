import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { listGamelistTagImages, saveGamelistTagImage } from "@/server/gameinfo-gamelist-tags";
import { auditActor, recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ images: await listGamelistTagImages() });
  } catch (error) {
    return handleApiError(error, "โหลดรูปหมวดหมู่ไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const body = await request.json();
    const before = (await listGamelistTagImages())[body.name] || "";
    const result = await saveGamelistTagImage(body.name, body.imageUrl);
    await recordGameinfoAudit({ gameId: 0, area: "settings", actor: auditActor(user), before: { tag: body.name, image: Boolean(before) }, after: { tag: result.name, image: Boolean(result.imageUrl) } });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error, "บันทึกรูปหมวดหมู่ไม่สำเร็จ");
  }
}
