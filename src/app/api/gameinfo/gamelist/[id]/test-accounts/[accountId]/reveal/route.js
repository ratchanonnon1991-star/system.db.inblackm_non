import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { revealGamelistTestAccount } from "@/server/gameinfo-game-settings";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

// POST rather than GET: a reveal is logged, so it should never be prefetched
// or replayed from history.
export async function POST(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id, accountId } = await params;
    return jsonOk(await revealGamelistTestAccount(Number(id), Number(accountId), auditActor(user)));
  } catch (error) {
    return handleApiError(error, "แสดงข้อมูลบัญชีทดสอบไม่สำเร็จ");
  }
}
