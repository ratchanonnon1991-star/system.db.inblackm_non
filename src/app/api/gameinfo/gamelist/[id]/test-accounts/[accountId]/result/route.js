import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { recordGamelistTestResult } from "@/server/gameinfo-game-settings";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function POST(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id, accountId } = await params;
    const { result } = await request.json();
    return jsonOk({ account: await recordGamelistTestResult(Number(id), Number(accountId), result, auditActor(user)) });
  } catch (error) {
    return handleApiError(error, "บันทึกผลทดสอบไม่สำเร็จ");
  }
}
