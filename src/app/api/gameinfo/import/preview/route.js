import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { parseCsv } from "@/lib/gameinfo-csv";
import { PACK_HEADERS, parsePacksForGame } from "@/lib/gameinfo-import";
import { getGameListRow, listGameListRows } from "@/server/gameinfo-gamelist";
import { listGamelistPackColumnRegistry } from "@/server/gameinfo-gamelist-packs";
import { getGameinfoFormulaVariables } from "@/server/gameinfo-formula-variables";
import { planGameinfoCsvImport } from "@/server/gameinfo-csv-import";

// Parse an uploaded CSV and return a preview — no DB writes. The file's own
// game_id column is ignored; every row is treated as ?gameId='s game_list
// row (used by the per-game pack editor — the only consumer left since the
// old multi-game games/game_packs admin import was removed).
export async function POST(request) {
  try {
    await requireGameinfoEditor(request);
    const { searchParams } = new URL(request.url);
    const gameIdRaw = searchParams.get("gameId");
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.text !== "function") {
      return jsonError("ไม่พบไฟล์ที่อัปโหลด", 400);
    }
    const name = String(file.name || "").toLowerCase();
    if (!name.endsWith(".csv")) {
      return jsonError("รองรับเฉพาะไฟล์ .csv", 400);
    }

    const { headers, rows } = parseCsv(await file.text());
    if (!rows.length) {
      return jsonError("ไฟล์ว่างเปล่า หรือไม่มีข้อมูลใต้หัวคอลัมน์", 400);
    }

    if (gameIdRaw) {
      // The single-game editor still takes only the known headers: it imports
      // into one game's pack tree and has its own column editor alongside.
      const unsupported = headers.filter(
        (header) => !PACK_HEADERS.includes(header) && header !== "amount_charged"
      );
      if (unsupported.length) return jsonError(`พบคอลัมน์ที่ระบบไม่รับ: ${unsupported.join(", ")}`, 400);
      const row = await getGameListRow(Number(gameIdRaw));
      if (!row) return jsonError("ไม่พบเกมนี้", 404);
      const { game: parsed, errors, countryIssues } = parsePacksForGame(rows, row.id, row.game);
      return jsonOk({ kind: "packs-single", game: parsed, errors, countryIssues });
    }
    // A bulk file may now name its game instead of carrying an id, so game_id
    // is no longer required — a row with neither is reported per row.
    const [existingGames, existingColumns, variableData] = await Promise.all([
      listGameListRows(),
      listGamelistPackColumnRegistry(),
      getGameinfoFormulaVariables(0),
    ]);
    const plan = planGameinfoCsvImport({
      headers,
      rows,
      existingGames,
      existingColumns: existingColumns.map((column) => ({ key: column.columnKey, label: column.label })),
      variableNames: variableData.variables.map((variable) => variable.name),
    });
    return jsonOk({
      kind: "packs-bulk",
      games: plan.games.map((game) => ({
        gameId: game.gameId,
        gameName: game.gameName,
        currentGameName: game.isNew ? "" : game.gameName,
        packCount: game.packCount,
        isNew: game.isNew,
        matchedByName: game.matchedByName,
        similar: game.similar,
      })),
      newGames: plan.newGames.map((game) => ({
        gameName: game.gameName,
        packCount: game.packCount,
        similar: game.similar,
      })),
      columns: plan.columns,
      newColumns: plan.newColumns,
      countryIssues: plan.countryIssues,
      errors: plan.errors,
      warnings: plan.warnings,
    });
  } catch (err) {
    return handleApiError(err, "อ่านไฟล์ไม่สำเร็จ");
  }
}
