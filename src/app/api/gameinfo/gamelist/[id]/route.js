import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { deleteGameListRow, updateGameListRow } from "@/server/gameinfo-gamelist";

export async function PUT(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    if (body.game !== undefined && !String(body.game).trim()) {
      return jsonError("กรุณากรอกชื่อเกม", 400);
    }
    const row = await updateGameListRow(Number(id), body);
    if (!row) return jsonError("ไม่พบเกมนี้", 404);
    return jsonOk({ row });
  } catch (err) {
    return handleApiError(err, "บันทึกข้อมูลเกมไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    await deleteGameListRow(Number(id));
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบเกมไม่สำเร็จ");
  }
}
