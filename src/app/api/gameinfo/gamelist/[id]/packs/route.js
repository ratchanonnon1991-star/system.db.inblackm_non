import { handleApiError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer";
import { getGamelistPacks, saveGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { recordEdit } from "@/server/gamedb-edit-log";

export async function PUT(request, { params }) {
  try {
    const admin = await requireLayoutEditor(request);
    const { id } = await params;
    const body = await request.json();
    const before = await getGamelistPacks(Number(id));
    const packs = await saveGamelistPacks(Number(id), {
      currencies: Array.isArray(body.currencies) ? body.currencies : [],
      computedColumns: sanitizeComputedColumns(body.computedColumns),
    });
    await recordEdit({
      queryId: null,
      actor: admin.username || admin.displayName || "",
      table: "gamelist_packs",
      pkColumn: "game_id",
      pkValue: Number(id),
      column: "(แพ็ก/ราคา)",
      oldValue: JSON.stringify(before).slice(0, 2000),
      newValue: JSON.stringify(packs).slice(0, 2000),
    });
    return jsonOk({ game: { id: Number(id), ...packs } });
  } catch (err) {
    return handleApiError(err, "บันทึกตารางแพ็กไม่สำเร็จ");
  }
}
