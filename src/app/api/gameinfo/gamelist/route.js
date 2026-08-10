import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import { createGameListRow } from "@/server/gameinfo-gamelist";
import { listGameinfoGamelistRows } from "@/server/gameinfo-gamelist-view";

export async function GET(request) {
  try {
    const user = await requireAdmin(request);
    const rows = await listGameinfoGamelistRows();
    return jsonOk({ rows, editable: user.role === "admin" || user.role === "staff" });
  } catch (err) {
    return handleApiError(err, "โหลดรายการเกมไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    await requireLayoutEditor(request);
    const body = await request.json();
    const game = String(body.game || "").trim();
    if (!game) return jsonError("กรุณากรอกชื่อเกม", 400);
    const row = await createGameListRow({ ...body, game });
    return jsonOk({ row }, 201);
  } catch (err) {
    return handleApiError(err, "เพิ่มเกมไม่สำเร็จ");
  }
}
