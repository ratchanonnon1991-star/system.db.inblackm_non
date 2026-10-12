import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { reorderGameListRows } from "@/server/gameinfo-gamelist";
import { recordGameinfoEditAfterSave } from "@/server/gameinfo-post-save";
import { requestMeta } from "@/lib/request-meta";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function POST(request) {
  try {
    const admin = await requireGameinfoEditor(request);
    const body = await request.json();
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(Number) : [];
    if (!orderedIds.length) return jsonError("ไม่มีลำดับที่จะบันทึก", 400);
    await reorderGameListRows(orderedIds, auditActor(admin));
    // One entry for the whole reorder, not one per row -- there's no
    // meaningful single pkValue, and a row's own old/new position isn't
    // worth reverting to individually the way a value is.
    await recordGameinfoEditAfterSave({
      queryId: null,
      actor: admin.username || admin.displayName || "",
      table: "gamelist_order",
      pkColumn: "game_id",
      pkValue: null,
      column: "(จัดเรียงลำดับ)",
      oldValue: null,
      newValue: JSON.stringify(orderedIds).slice(0, 2000),
      ...requestMeta(request),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "บันทึกลำดับไม่สำเร็จ");
  }
}
