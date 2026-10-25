import { handleApiError, jsonOk } from "@/lib/http";
import { canManageGameinfo, requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import {
  createGamelistTestAccount,
  listGamelistTestAccounts,
  maskGamelistTestAccount,
} from "@/server/gameinfo-game-settings";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function GET(request, { params }) {
  try {
    const user = await requireGameinfoAccess(request);
    const { id } = await params;
    const accounts = await listGamelistTestAccounts(Number(id));
    return jsonOk({ accounts: canManageGameinfo(user) ? accounts : accounts.map(maskGamelistTestAccount) });
  } catch (error) {
    return handleApiError(error, "โหลดบัญชีทดสอบไม่สำเร็จ");
  }
}

export async function POST(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const account = await createGamelistTestAccount(Number(id), await request.json(), auditActor(user));
    return jsonOk({ account });
  } catch (error) {
    return handleApiError(error, "เพิ่มบัญชีทดสอบไม่สำเร็จ");
  }
}
