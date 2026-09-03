// Pack columns used to be defined per game: the same "กำไร" column had to be
// recreated in all 216 games and every formula fix had to be repeated 216
// times. The definition now lives once in a shared registry and every game
// sees every column — a game with nothing to put in one just renders it empty
// (see gameinfoColumnsWithData in gameinfo-pack-columns.js).
//
// What stays per game is what is genuinely about that game's packs:
//   gameFormula      a formula this one game computes differently
//   categoryFormulas keyed by that game's category ids
//   rowOverrides     keyed by that game's pack ids
//   enabled          whether a market column is switched on here
//
// Split and merge are pure so the storage layer can round-trip a column
// without the UI ever seeing the two halves: getGamelistPacks merges back into
// the single flat column shape every component already reads.

// Definition fields — one value shared by every game.
const REGISTRY_FIELDS = [
  "formula",
  "entryMode",
  "kind",
  "marketKey",
  "type",
  "symbol",
  "scopeMode",
];

// A merged column carries both halves. `formula` is the registry's; the
// per-game formula rides alongside as `gameFormula` so getEffectiveGameinfoFormula
// can tell "this game computes it differently" from "this is the global rule".
export function mergeGameinfoColumn(registryRow, override = {}) {
  const data = registryRow?.data || {};
  // Key order matches the shape the editor and the legacy `columns` array use,
  // so a merged column and a pre-registry one serialise identically.
  const merged = { key: registryRow.columnKey, label: registryRow.label };
  for (const field of REGISTRY_FIELDS) merged[field] = data[field];
  // The definition this client was shown. It travels with the column so a save
  // can be refused when someone else has since changed it — the game's own
  // version guards its packs and says nothing about the shared columns.
  merged.version = Number(registryRow.version) || 1;
  merged.gameFormula = typeof override.gameFormula === "string" ? override.gameFormula : "";
  // A market column is registered for every game but is only *switched on* in
  // the games that mapped that market, so it defaults off and the game has to
  // say yes. Every other kind of column defaults on — that is the whole point
  // of sharing them.
  merged.enabled = data.kind === "market" ? override.enabled === true : override.enabled !== false;
  merged.categoryFormulas = override.categoryFormulas || {};
  merged.rowOverrides = override.rowOverrides || {};
  return merged;
}

/** Registry rows + this game's overrides -> the flat column array the UI reads. */
export function mergeGameinfoColumns(registryRows, overridesByKey = {}) {
  return (registryRows || []).map((row) =>
    mergeGameinfoColumn(row, overridesByKey?.[row.columnKey] || {})
  );
}

/** The inverse: one edited column -> the registry row and this game's override. */
export function splitGameinfoColumn(column, sortOrder = 0) {
  const data = {};
  for (const field of REGISTRY_FIELDS) data[field] = column[field];
  const override = {};
  // Only store what differs from the shared definition, so a game that uses
  // the column as-is leaves no row behind and picks up later edits to it.
  if (typeof column.gameFormula === "string" && column.gameFormula.trim()) {
    override.gameFormula = column.gameFormula;
  }
  if (Object.keys(column.categoryFormulas || {}).length) {
    override.categoryFormulas = column.categoryFormulas;
  }
  if (Object.keys(column.rowOverrides || {}).length) {
    override.rowOverrides = column.rowOverrides;
  }
  // Being switched on is the exception for a market column, so that is what
  // gets stored — the absence of a row means off, in every other game.
  if (column.kind === "market" && column.enabled !== false) override.enabled = true;
  return {
    registry: {
      columnKey: column.key,
      label: column.label,
      sortOrder,
      data,
      // Absent for a column this editor just created, which is how the write
      // path tells "new" from "someone else deleted it while I was editing".
      version: Number(column.version) || null,
    },
    override: Object.keys(override).length ? override : null,
  };
}

/** Every edited column -> the registry rows and this game's override map. */
export function splitGameinfoColumns(columns) {
  const registry = [];
  const overrides = {};
  (columns || []).forEach((column, index) => {
    const split = splitGameinfoColumn(column, index);
    registry.push(split.registry);
    if (split.override) overrides[column.key] = split.override;
  });
  return { registry, overrides };
}

// The pre-registry `columns` array is still written on every save so that
// reverting this code is a complete rollback — no data restore. In that shape
// a column's formula is the one *this* game computes, so the per-game formula
// has to be folded back down into it.
export function flattenGameinfoColumnsForLegacy(columns) {
  return (columns || []).map((column) => {
    const { gameFormula, ...rest } = column;
    return typeof gameFormula === "string" && gameFormula.trim()
      ? { ...rest, formula: gameFormula }
      : rest;
  });
}

// Before the registry existed a column's formula was per game by definition.
// Backfill has to decide which of those becomes the shared formula: the most
// common one wins and every game that disagreed keeps its own as a gameFormula,
// so no game's numbers change.
export function pickSharedGameinfoFormula(formulas) {
  const counts = new Map();
  for (const formula of formulas || []) {
    const key = typeof formula === "string" ? formula : "";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  for (const [formula, count] of counts) {
    // Ties go to the first formula seen, which keeps backfill deterministic.
    if (count > bestCount) {
      best = formula;
      bestCount = count;
    }
  }
  return best;
}
