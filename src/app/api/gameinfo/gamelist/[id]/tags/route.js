import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { getGamelistTags, saveGamelistTags } from "@/server/gameinfo-gamelist-tags";
import { auditActor, recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const { id } = await params;
    return jsonOk({ tags: await getGamelistTags(Number(id)) });
  } catch (error) {
    return handleApiError(error, "โหลด tags เกมไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    const before = await getGamelistTags(Number(id));
    const tags = await saveGamelistTags(Number(id), body.tags);
    await recordGameinfoAudit({ gameId: Number(id), area: "tags", actor: auditActor(user), before: { tags: before }, after: { tags } });
    return jsonOk({ tags });
  } catch (error) {
    return handleApiError(error, "บันทึก tags เกมไม่สำเร็จ");
  }
}
