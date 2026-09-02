import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { deleteRussiaCheckSourceSession, saveRussiaCheckSourceSession } from "@/server/gameinfo-russia-check";

export async function PUT(request, { params }) {
  try {
    const actor = await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return jsonOk(await saveRussiaCheckSourceSession(id, body, actor));
  } catch (error) {
    return handleApiError(error, "บันทึก session ไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireGameinfoEditor(request);
    const { id } = await params;
    return jsonOk(await deleteRussiaCheckSourceSession(id));
  } catch (error) {
    return handleApiError(error, "ลบ session ไม่สำเร็จ");
  }
}
