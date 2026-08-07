import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import {
  deleteGameinfoGame,
  getGameinfoGame,
  updateGameinfoGame,
} from "@/server/gameinfo-games";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const game = await getGameinfoGame(Number(id));
    if (!game) return jsonError("ไม่พบเกมนี้", 404);
    return jsonOk({ game });
  } catch (err) {
    return handleApiError(err, "โหลดข้อมูลเกมไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    if (body.gameName !== undefined && !String(body.gameName).trim()) {
      return jsonError("กรุณากรอกชื่อเกม", 400);
    }
    const game = await updateGameinfoGame(Number(id), body);
    if (!game) return jsonError("ไม่พบเกมนี้", 404);
    return jsonOk({ game });
  } catch (err) {
    return handleApiError(err, "บันทึกข้อมูลเกมไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireLayoutEditor(request);
    const { id } = await params;
    await deleteGameinfoGame(Number(id));
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบเกมไม่สำเร็จ");
  }
}
