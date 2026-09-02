import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { parseCsv } from "@/lib/gameinfo-csv";
import { mergeCurrencies } from "@/lib/gameinfo-import";
import {
  createGameListRows,
  listGameListRows,
  withGameinfoTransaction,
} from "@/server/gameinfo-gamelist";
import {
  auditActor,
  importGamelistPacks,
  listGamelistPackColumnRegistry,
  recordGameinfoAudit,
} from "@/server/gameinfo-gamelist-packs";
import { planGameinfoCsvImport } from "@/server/gameinfo-csv-import";
import { confirmedGameinfoCsvGames } from "@/lib/gameinfo-csv-games";
import { gameNameKey } from "@/lib/text-distance";

// idpass keeps its own copy of the merged column list. An imported column that
// this game has never seen is appended; one it already has keeps its
// definition, since the definition is shared and the CSV only carries values.
function mergeImportedColumns(current, imported) {
  const columns = Array.isArray(current) ? [...current] : [];
  const known = new Set(columns.map((column) => column.key));
  for (const column of imported || []) {
    if (known.has(column.key)) continue;
    columns.push({
      key: column.key,
      label: column.label,
      formula: column.formula || "",
      entryMode: column.entryMode || "manual",
      kind: "formula",
      marketKey: "",
      type: "number",
      symbol: "",
      scopeMode: "global",
      categoryFormulas: {},
      rowOverrides: {},
    });
  }
  return columns;
}

function mergeImportedOverrides(current, imported) {
  const overrides = { ...(current || {}) };
  for (const column of imported || []) {
    if (!Object.keys(column.rowOverrides || {}).length) continue;
    const existing = overrides[column.key] || {};
    overrides[column.key] = {
      ...existing,
      rowOverrides: { ...(existing.rowOverrides || {}), ...column.rowOverrides },
    };
  }
  return overrides;
}

// The preview sends back exactly what the user ticked. An absent field means
// they never confirmed; an empty list means they confirmed none.
function parseConfirmList(value) {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : null;
  } catch {
    return null;
  }
}
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { getGameinfoModeData, saveGameinfoModeData } from "@/server/gameinfo-mode-data";
import { findDuplicateGameinfoPackNamePrices } from "@/lib/gameinfo-pack-validation";

export async function PUT(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const form = await request.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") || "replace");
    if (!file || typeof file.text !== "function") return jsonError("ไม่พบไฟล์ที่อัปโหลด", 400);
    if (!String(file.name || "").toLowerCase().endsWith(".csv")) return jsonError("รองรับเฉพาะไฟล์ .csv", 400);
    if (mode !== "replace" && mode !== "add") return jsonError("โหมดนำเข้าไม่ถูกต้อง", 400);
    const { headers, rows } = parseCsv(await file.text());
    if (!rows.length) return jsonError("ไฟล์ว่างเปล่า หรือไม่มีข้อมูลใต้หัวคอลัมน์", 400);
    // The file is re-read here rather than carried over from the preview, so
    // the same planner has to run again — anything the user confirmed is
    // matched by name against this reading, never taken on trust.
    const [existingGames, registry] = await Promise.all([
      listGameListRows(),
      listGamelistPackColumnRegistry(),
    ]);
    const plan = planGameinfoCsvImport({
      headers,
      rows,
      existingGames,
      existingColumns: registry.map((column) => ({ key: column.columnKey, label: column.label })),
    });
    const errors = [...plan.errors];
    if (!plan.games.length) errors.push("ไม่พบข้อมูลเกมที่นำเข้าได้");

    // Creating a game or a column is not undoable, and a typo'd game name is
    // indistinguishable from a new game, so neither happens unless the user
    // ticked it in the preview. An absent list means they never saw the
    // preview for this file.
    const confirmedGames = parseConfirmList(form.get("confirmNewGames"));
    const confirmedColumns = parseConfirmList(form.get("confirmNewColumns"));
    if (plan.newGames.length && !confirmedGames) {
      errors.push(
        `ไฟล์นี้จะสร้างเกมใหม่ ${plan.newGames.length} เกม (${plan.newGames
          .map((game) => game.gameName)
          .join(", ")}) — กรุณายืนยันในหน้าตัวอย่างก่อน`
      );
    }
    if (plan.newColumns.length && !confirmedColumns) {
      errors.push(
        `ไฟล์นี้จะสร้างคอลัมน์ใหม่ ${plan.newColumns.length} คอลัมน์ (${plan.newColumns
          .map((column) => column.label)
          .join(", ")}) — กรุณายืนยันในหน้าตัวอย่างก่อน`
      );
    }
    if (errors.length) return jsonError(errors.join("\n"), 400);

    const { confirmed: gamesToCreate, skipped: gamesSkipped } = confirmedGameinfoCsvGames(
      plan.newGames,
      confirmedGames || []
    );
    const skippedGameNames = new Set(gamesSkipped.map((game) => gameNameKey(game.gameName)));
    const keptColumns = new Set(
      plan.columns
        .filter((column) => !column.isNew || (confirmedColumns || []).includes(column.label))
        .map((column) => column.key)
    );
    const actor = { id: user.id, name: user.displayName || user.username };
    const idpass = normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode")) === "idpass";
    const result = await withGameinfoTransaction(async (client) => {
      // Creating the games first is what turns a name into the game_id the
      // pack rows need; the sequence hands out the id, we never compute one.
      const createdRows = gamesToCreate.length
        ? await createGameListRows(
            gamesToCreate.map((game) => ({ game: game.gameName })),
            auditActor(user),
            client
          )
        : [];
      const idByName = new Map(createdRows.map((row) => [gameNameKey(row.game), Number(row.id)]));
      const importable = [];
      for (const game of plan.games) {
        const gameId = game.isNew ? idByName.get(gameNameKey(game.gameName)) : game.gameId;
        // A game the user chose not to create takes its rows with it.
        if (!gameId) continue;
        importable.push({
          ...game,
          gameId,
          columns: game.columns.filter((column) => keptColumns.has(column.key)),
        });
      }

      if (idpass) {
        let count = 0;
        for (const game of importable) {
          const current = await getGameinfoModeData(game.gameId, "idpass", client);
          const currencies = mode === "add"
            ? mergeCurrencies(current.packs.currencies, game.currencies)
            : game.currencies;
          if (findDuplicateGameinfoPackNamePrices(currencies).size > 0) {
            const error = new Error(`game_id ${game.gameId}: ชื่อ Pack และราคาห้ามซ้ำกันพร้อมกัน`);
            error.status = 400;
            throw error;
          }
          count += game.packCount;
          const nextPacks = {
            ...current.packs,
            currencies,
            // Columns are shared across both storage modes, so an imported
            // column lands here the same way it lands in the uid store.
            computedColumns: mergeImportedColumns(current.packs.computedColumns, game.columns),
            columnOverrides: mergeImportedOverrides(current.packs.columnOverrides, game.columns),
          };
          await saveGameinfoModeData(game.gameId, "idpass", { ...current, packs: nextPacks }, client);
          await recordGameinfoAudit({
            gameId: game.gameId,
            area: "import",
            dataMode: "idpass",
            action: mode === "add" ? "import_append" : "import_replace",
            source: mode === "add" ? "csv_append" : "csv_replace",
            actor: auditActor(user),
            before: current.packs,
            after: nextPacks,
            client,
          });
        }
        return { gameCount: importable.length, packCount: count, createdGameCount: createdRows.length };
      }

      const imported = await importGamelistPacks(importable, mode, actor, client);
      return { ...imported, createdGameCount: createdRows.length };
    });
    return jsonOk({
      ...result,
      skippedGameNames: [...skippedGameNames],
      newColumnCount: plan.newColumns.filter((column) => keptColumns.has(column.key)).length,
    });
  } catch (error) {
    return handleApiError(error, "นำเข้า packs ไม่สำเร็จ");
  }
}
