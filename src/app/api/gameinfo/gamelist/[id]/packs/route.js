import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer";
import { saveGamelistPacks } from "@/server/gameinfo-gamelist-packs";

export async function PUT(request, { params }) {
  try {
    const user = await requireLayoutEditor(request);
    const { id } = await params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId <= 0) return jsonError("gameId ไม่ถูกต้อง", 400);
    const body = await request.json();
    const source = body.auditSource === "csv_append" || body.auditSource === "csv_replace"
      ? body.auditSource
      : "editor";
    const packs = await saveGamelistPacks(gameId, {
      currencies: Array.isArray(body.currencies) ? body.currencies : [],
      computedColumns: sanitizeComputedColumns(body.computedColumns),
      actor: { id: user.id, name: user.displayName || user.username },
      source,
    });
    return jsonOk({ game: { id: gameId, ...packs } });
  } catch (err) {
    return handleApiError(err, "บันทึกตารางแพ็กไม่สำเร็จ");
  }
}
