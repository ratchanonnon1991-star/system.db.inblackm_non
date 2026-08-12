import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireLayoutEditor } from "@/server/auth";
import { createGameListRow, listGameListRows } from "@/server/gameinfo-gamelist";
import { recordEdit } from "@/server/gamedb-edit-log";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const rows = await listGameListRows();
    return jsonOk({ rows });
  } catch (err) {
    return handleApiError(err, "โหลดรายการเกมไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const admin = await requireLayoutEditor(request);
    const body = await request.json();
    const game = String(body.game || "").trim();
    if (!game) return jsonError("กรุณากรอกชื่อเกม", 400);
    const row = await createGameListRow({ ...body, game });
    // GameInfo has no "Query" of its own for the log's queryId to point at --
    // every entry from here carries queryId: null, which is also what tells
    // the /log revert button not to offer reverting it (see canRevert there).
    await recordEdit({
      queryId: null,
      actor: admin.username || admin.displayName || "",
      table: "game_list",
      pkColumn: "id",
      pkValue: row.id,
      column: "(เพิ่มเกม)",
      oldValue: null,
      newValue: JSON.stringify(row).slice(0, 2000),
    });
    return jsonOk({ row }, 201);
  } catch (err) {
    return handleApiError(err, "เพิ่มเกมไม่สำเร็จ");
  }
}
