import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer";
import { saveGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { pruneGameinfoFormulaOverrides } from "@/lib/gameinfo-formula-overrides";
import { sanitizeGameinfoCostProfiles } from "@/lib/gameinfo-cost-profiles";
import { validateGameinfoComputedDependencies } from "@/lib/gameinfo-computed-evaluator";
import { getGameinfoFormulaVariables } from "@/server/gameinfo-formula-variables";

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
    const currencies = Array.isArray(body.currencies) ? body.currencies : [];
    const packIds = currencies.flatMap((currency) =>
      (currency?.categories || []).flatMap((category) =>
        (category?.packs || []).map((pack) => pack?.id).filter(Boolean)
      )
    );
    const computedColumns = pruneGameinfoFormulaOverrides(
      sanitizeComputedColumns(body.computedColumns),
      packIds
    );
    const variableData = await getGameinfoFormulaVariables(gameId);
    const formulaErrors = validateGameinfoComputedDependencies(
      computedColumns,
      variableData.variables.map((variable) => variable.name)
    );
    if (formulaErrors.length) return jsonError(formulaErrors[0], 400);
    const packs = await saveGamelistPacks(gameId, {
      currencies,
      computedColumns,
      costProfiles: sanitizeGameinfoCostProfiles(body.costProfiles),
      actor: { id: user.id, name: user.displayName || user.username },
      source,
    });
    return jsonOk({ game: { id: gameId, ...packs } });
  } catch (err) {
    return handleApiError(err, "บันทึกตารางแพ็กไม่สำเร็จ");
  }
}
