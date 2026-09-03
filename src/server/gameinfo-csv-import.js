// One reading of an uploaded CSV, shared by the preview and the apply routes.
//
// Apply re-reads and re-parses the file rather than trusting a token from the
// preview, so the two must reach identical conclusions or a user could confirm
// one thing and get another. Keeping the whole reading here is what guarantees
// that; the routes only differ in what they do with the result.
import { buildPackTree, validatePackRows } from "@/lib/gameinfo-import";
import {
  buildGameinfoCsvColumns,
  createGameinfoCsvColumnKeys,
  gameinfoCsvExtraHeaders,
} from "@/lib/gameinfo-csv-columns";
import { resolveGameinfoCsvGames } from "@/lib/gameinfo-csv-games";
import { findDuplicateGameinfoPackNamePrices } from "@/lib/gameinfo-pack-validation";
import { normalizeGameinfoCountry, suggestGameinfoCountries } from "@/lib/gameinfo-countries";

const AMOUNT_CHARGED_WARNING = "พบคอลัมน์ amount_charged";

function normalizeCountries(currencies) {
  const issues = [];
  for (const currency of currencies) {
    for (const category of currency.categories) {
      for (const pack of category.packs) {
        const normalized = normalizeGameinfoCountry(pack.country);
        if (normalized.matched) pack.country = normalized.value;
        else if (pack.country) {
          issues.push({
            packId: pack.id,
            packName: pack.name,
            input: pack.country,
            suggestions: suggestGameinfoCountries(pack.country),
          });
        }
      }
    }
  }
  return issues;
}

function legacyAmountWarnings(rows) {
  const count = (rows || []).filter((row) => String(row?.amount_charged ?? "").trim() !== "").length;
  return count
    ? [`${AMOUNT_CHARGED_WARNING} ${count} แถว — ระบบเลิกใช้แล้วและจะไม่นำเข้าค่านี้`]
    : [];
}

/**
 * A parsed CSV + the current games and columns -> everything both routes need.
 *
 * `games` are the games this file writes to, each with the pack tree it builds
 * and the column values it carries. A game with `isNew` does not exist yet and
 * is only created once the user confirms it by name.
 */
export function planGameinfoCsvImport({ headers, rows, existingGames, existingColumns, variableNames = [] }) {
  const resolved = resolveGameinfoCsvGames(rows, existingGames);
  const errors = [...resolved.errors, ...validatePackRows(rows)];
  const warnings = [...legacyAmountWarnings(rows), ...resolved.warnings];

  const games = [];
  const columnsByLabel = new Map();
  const countryIssues = [];
  // Shared by every game in the file: a header is one column, so it has to be
  // one key too — see createGameinfoCsvColumnKeys.
  const newColumnKey = createGameinfoCsvColumnKeys();

  function addGame(bucket, { gameId, isNew }) {
    const tree = buildPackTree(bucket.rows);
    countryIssues.push(...normalizeCountries(tree.currencies));
    const built = buildGameinfoCsvColumns(
      headers,
      tree.rowPacks,
      existingColumns,
      variableNames,
      newColumnKey
    );
    errors.push(...built.errors);
    for (const column of built.columns) {
      // One label is one column across the whole file, even when several games
      // carry it — that is what makes it a shared column rather than a copy
      // per game. Per-pack values stay with the game whose packs they are.
      const seen = columnsByLabel.get(column.label);
      if (!seen) {
        columnsByLabel.set(column.label, {
          key: column.key,
          label: column.label,
          isNew: column.isNew,
          // What the file computes, per game. The column's own formula is not
          // set from a CSV — see buildGameinfoCsvColumns — so this is here to
          // be shown in the preview, and to record whether the games in the
          // file agree on one rule.
          formula: column.gameFormula,
          gameFormulas: column.gameFormula ? [column.gameFormula] : [],
          entryMode: column.entryMode,
          valueCount: column.valueCount,
          unknownRefs: [...column.unknownRefs],
        });
      } else {
        seen.valueCount += column.valueCount;
        for (const ref of column.unknownRefs) {
          if (!seen.unknownRefs.includes(ref)) seen.unknownRefs.push(ref);
        }
        // Each game keeps the rule it stated; the preview only needs to know
        // what they are and whether they are all the same one.
        if (column.gameFormula && !seen.gameFormulas.includes(column.gameFormula)) {
          seen.gameFormulas.push(column.gameFormula);
        }
        if (!seen.formula) seen.formula = column.gameFormula;
        if (column.entryMode === "formula") seen.entryMode = "formula";
      }
    }
    if (findDuplicateGameinfoPackNamePrices(tree.currencies).size > 0) {
      errors.push(`${bucket.gameName || `game_id ${gameId}`}: ชื่อ Pack และราคาห้ามซ้ำกันพร้อมกัน`);
    }
    games.push({
      gameId,
      gameName: bucket.gameName,
      isNew,
      matchedByName: Boolean(bucket.matchedByName),
      similar: bucket.similar || [],
      currencies: tree.currencies,
      packCount: tree.packCount,
      columns: built.columns,
    });
  }

  for (const bucket of resolved.existing) addGame(bucket, { gameId: bucket.gameId, isNew: false });
  for (const bucket of resolved.created) addGame(bucket, { gameId: null, isNew: true });

  const columns = [...columnsByLabel.values()];
  // A column is one definition for every game, so the games in one file cannot
  // each register a different entry mode: a column any game states a rule for
  // is a formula column, and the games with no rule simply have no rule.
  const formulaColumns = new Set(
    columns.filter((column) => column.entryMode === "formula").map((column) => column.key)
  );
  for (const game of games) {
    for (const column of game.columns) {
      if (formulaColumns.has(column.key)) column.entryMode = "formula";
    }
  }
  // Reported rather than refused: the formula is valid, it just names
  // something that does not exist yet. The user can fix the file, or leave the
  // column unticked, which is what removing it means here.
  for (const column of columns) {
    if (!column.unknownRefs.length) continue;
    warnings.push(
      `คอลัมน์ "${column.label}" อ้างถึง ${column.unknownRefs
        .map((ref) => `[${ref}]`)
        .join(", ")} ซึ่งไม่มีในระบบ — แก้ไฟล์ หรือไม่ต้องติ๊กคอลัมน์นี้`
    );
  }
  return {
    games,
    newGames: games.filter((game) => game.isNew),
    columns,
    newColumns: columns.filter((column) => column.isNew),
    countryIssues,
    errors,
    warnings,
  };
}
