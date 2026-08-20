import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import {
  getGameinfoFormulaVariables,
  saveGameinfoFormulaVariables,
} from "@/server/gameinfo-formula-variables";
import {
  getGamelistPacks,
  listAllGamelistComputedColumns,
} from "@/server/gameinfo-gamelist-packs";
import { sanitizeGameinfoFormulaVariables } from "@/lib/gameinfo-formula-variables";
import { validateGameinfoComputedDependencies } from "@/lib/gameinfo-computed-evaluator";
import { getGameListRow } from "@/server/gameinfo-gamelist";
import { getGameinfoExchangeRates } from "@/server/gameinfo-exchange-rates";
import { GAMEINFO_FIELD_NAMES, resolveGameinfoField } from "@/lib/gameinfo-formula-fields";
import { listGameinfoModeData } from "@/server/gameinfo-mode-data";

function firstPack(currencies) {
  for (const currency of currencies || []) {
    for (const category of currency.categories || []) {
      if (category.packs?.length) return category.packs[0];
    }
  }
  return null;
}

export async function GET(request, { params }) {
  try {
    await requireGameinfoEditor(request);
    const { id } = await params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId <= 0) return jsonError("gameId ไม่ถูกต้อง", 400);
    const [data, packs, game, rates] = await Promise.all([
      getGameinfoFormulaVariables(gameId, { includeLogs: true }),
      getGamelistPacks(gameId),
      getGameListRow(gameId),
      getGameinfoExchangeRates(["USDT/THB", "USDCNY"]).catch(() => []),
    ]);
    const pack = firstPack(packs.currencies);
    const previewValues = {};
    if (pack && game) {
      const context = {
        costProfiles: packs.costProfiles,
        formulaVariables: data.variables,
        externalValues: Object.fromEntries(
          rates.filter((rate) => rate.available).map((rate) => [rate.pair, rate.rate])
        ),
      };
      const formulaGame = { ...game, gameName: game.game };
      for (const name of GAMEINFO_FIELD_NAMES) {
        previewValues[name] = resolveGameinfoField(pack, formulaGame, name, context);
      }
    }
    return jsonOk({
      ...data,
      previewValues,
      previewPackName: pack?.name || "",
    });
  } catch (error) {
    return handleApiError(error, "โหลดตัวแปรผสมไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId <= 0) return jsonError("gameId ไม่ถูกต้อง", 400);
    const body = await request.json();
    const candidateVariables = sanitizeGameinfoFormulaVariables(body.variables);
    const [uidConfigs, idpassByGame] = await Promise.all([
      listAllGamelistComputedColumns(),
      listGameinfoModeData("idpass"),
    ]);
    const configs = [
      ...uidConfigs,
      ...Object.entries(idpassByGame).map(([storedGameId, data]) => ({
        gameId: `${storedGameId} (IDPASS)`,
        computedColumns: data.packs.computedColumns,
      })),
    ];
    for (const config of configs) {
      const dependencyErrors = validateGameinfoComputedDependencies(
        config.computedColumns,
        candidateVariables.map((variable) => variable.name)
      );
      if (dependencyErrors.length) {
        return jsonError(`ยังบันทึกตัวแปรไม่ได้: เกม ID ${config.gameId} — ${dependencyErrors[0]}`, 400);
      }
    }
    const variables = await saveGameinfoFormulaVariables(gameId, body.variables, {
      id: user.id,
      name: user.displayName || user.username,
    });
    return jsonOk({ variables });
  } catch (error) {
    return handleApiError(error, "บันทึกตัวแปรผสมไม่สำเร็จ");
  }
}
