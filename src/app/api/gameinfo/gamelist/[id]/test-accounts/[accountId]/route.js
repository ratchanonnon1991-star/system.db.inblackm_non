import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { deleteGamelistTestAccount, updateGamelistTestAccount } from "@/server/gameinfo-game-settings";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id, accountId } = await params;
    const account = await updateGamelistTestAccount(Number(id), Number(accountId), await request.json(), auditActor(user));
    return jsonOk({ account });
  } catch (error) {
    return handleApiError(error, "บันทึกบัญชีทดสอบไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id, accountId } = await params;
    await deleteGamelistTestAccount(Number(id), Number(accountId), auditActor(user));
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error, "ลบบัญชีทดสอบไม่สำเร็จ");
  }
}
