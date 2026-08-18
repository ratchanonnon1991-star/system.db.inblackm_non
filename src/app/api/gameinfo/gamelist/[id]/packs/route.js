import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer";
import { getGamelistPacks, saveGamelistPacks } from "@/server/gameinfo-gamelist-packs";
import { recordEdit } from "@/server/gamedb-edit-log";
import { requestMeta } from "@/lib/request-meta";
import { pruneGameinfoFormulaOverrides } from "@/lib/gameinfo-formula-overrides";
import { sanitizeGameinfoCostProfiles } from "@/lib/gameinfo-cost-profiles";
import { validateGameinfoComputedDependencies } from "@/lib/gameinfo-computed-evaluator";
import { getGameinfoFormulaVariables } from "@/server/gameinfo-formula-variables";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { updateGameinfoModeData } from "@/server/gameinfo-mode-data";

export async function PUT(request, { params }) {
  try {
    const user = await requireLayoutEditor(request);
    const { id } = await params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId <= 0) return jsonError("gameId ไม่ถูกต้อง", 400);
    const body = await request.json();
    const mode = normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode"));
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
    const packInput = {
      currencies,
      computedColumns,
      costProfiles: sanitizeGameinfoCostProfiles(body.costProfiles),
    };
    if (mode === "idpass") {
      const data = await updateGameinfoModeData(gameId, mode, (current) => ({
        ...current,
        packs: packInput,
      }));
      return jsonOk({ game: { id: gameId, ...data.packs } });
    }
    // Read before writing, so the edit log can say what this replaced. The
    // packs module keeps its own audit trail of who and from where; this is
    // the same before/after every other write in the app records.
    const before = await getGamelistPacks(gameId);
    const packs = await saveGamelistPacks(gameId, {
      ...packInput,
      actor: { id: user.id, name: user.displayName || user.username },
      source,
    });
    await recordEdit({
      queryId: null,
      actor: user.username || user.displayName || "",
      table: "gamelist_packs",
      pkColumn: "game_id",
      pkValue: gameId,
      column: "(แพ็ก/ราคา)",
      oldValue: JSON.stringify(before).slice(0, 2000),
      newValue: JSON.stringify(packs).slice(0, 2000),
      ...requestMeta(request),
    });
    return jsonOk({ game: { id: gameId, ...packs } });
  } catch (err) {
    return handleApiError(err, "บันทึกตารางแพ็กไม่สำเร็จ");
  }
}
