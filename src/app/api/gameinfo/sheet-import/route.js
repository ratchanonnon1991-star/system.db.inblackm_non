import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { applyGameinfoSheetCostFormulas, applyGameinfoSheetImport, gameinfoSheetServiceAccount, previewGameinfoSheetImport } from "@/server/gameinfo-sheet-import";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    return jsonOk(await previewGameinfoSheetImport());
  } catch (error) {
    // The address to share the sheet with travels with the error, so the
    // page can say exactly what to do.
    if (error?.status === 403 || error?.status === 503) {
      return Response.json({ error: error.message, serviceAccount: await gameinfoSheetServiceAccount() }, { status: error.status });
    }
    return handleApiError(error, "อ่านข้อมูลจากชีตไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const { gameIds, parts, action } = await request.json();
    // A one-off catch-up for games imported before their cost formula existed.
    if (action === "cost-formulas") return jsonOk(await applyGameinfoSheetCostFormulas(auditActor(user)));
    return jsonOk(await applyGameinfoSheetImport(gameIds, parts, auditActor(user)));
  } catch (error) {
    return handleApiError(error, "นำเข้าข้อมูลจากชีตไม่สำเร็จ");
  }
}
