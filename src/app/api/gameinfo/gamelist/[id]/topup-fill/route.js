import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { fillGameFromTopupWeb } from "@/server/gameinfo-topup-import";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function POST(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    return jsonOk(await fillGameFromTopupWeb(Number(id), { image: body.image === true, tags: body.tags === true }, auditActor(user)));
  } catch (error) {
    return handleApiError(error, "เติมข้อมูลจากเว็บไม่สำเร็จ");
  }
}
