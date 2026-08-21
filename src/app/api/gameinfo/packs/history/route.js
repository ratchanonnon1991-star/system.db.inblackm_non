import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { listAllGamelistPackAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    const limit = Number(new URL(request.url).searchParams.get("limit") || 1000);
    return jsonOk({ history: await listAllGamelistPackAudit(limit) });
  } catch (error) {
    return handleApiError(error, "โหลดประวัติการแก้ไขรวมไม่สำเร็จ");
  }
}
