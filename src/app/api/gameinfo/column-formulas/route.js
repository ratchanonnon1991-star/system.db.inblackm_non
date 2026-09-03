import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { listGameinfoColumnFormulaUsage } from "@/server/gameinfo-gamelist-packs";

// What other games already compute in this column, so the formula editor can
// offer them instead of asking the user to remember one and retype it. Editor
// only: it reads every game's formulas, which is exactly what the pack editor
// is allowed to see and nobody else is.
export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    const params = request.nextUrl.searchParams;
    const columnKey = String(params.get("columnKey") || "").trim();
    if (!columnKey) return jsonError("ต้องระบุ columnKey", 400);
    const formulas = await listGameinfoColumnFormulaUsage(
      columnKey.slice(0, 64),
      String(params.get("label") || "").slice(0, 120)
    );
    return jsonOk({ formulas });
  } catch (error) {
    return handleApiError(error, "โหลดสูตรที่เกมอื่นใช้ไม่สำเร็จ");
  }
}
