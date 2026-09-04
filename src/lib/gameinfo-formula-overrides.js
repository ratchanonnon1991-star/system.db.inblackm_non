// Narrowest scope wins:
//   pack override -> category formula -> game formula -> manual entry -> the
// column's own formula. `gameFormula` is the layer the shared column registry
// added: one column definition is used by every game, so a game that needs to
// compute this column differently overrides the formula without forking the
// column. Columns that predate the registry have no gameFormula and skip it.
//
// "Manual" sits below the per-game layers on purpose: it means the column has
// no shared rule and is typed in game by game, so a game that does have a rule
// of its own must still be allowed to use it. Above it, only the shared
// formula is suppressed.
export function getEffectiveGameinfoFormula(column, packId, categoryId) {
  const override = column?.rowOverrides?.[String(packId)];
  if (typeof override === "string" && override.trim()) {
    return { formula: override, overridden: true, source: "override" };
  }
  const categoryFormula = column?.categoryFormulas?.[String(categoryId)];
  if (
    column?.scopeMode === "category" &&
    typeof categoryFormula === "string" &&
    categoryFormula.trim()
  ) {
    return { formula: categoryFormula, overridden: true, source: "category" };
  }
  const gameFormula = column?.gameFormula;
  if (typeof gameFormula === "string" && gameFormula.trim()) {
    return { formula: gameFormula, overridden: true, source: "game" };
  }
  if (column?.entryMode === "manual") {
    return { formula: "", overridden: false, source: "manual" };
  }
  return {
    formula: typeof column?.formula === "string" ? column.formula : "",
    overridden: false,
    source: "main",
  };
}

// Task 8's formula-display mode needs the exact same effective formula as
// the evaluator plus a stable source label. Keeping this here prevents the
// editor and read-only view from disagreeing about inherited vs overridden.
export function getGameinfoFormulaDisplay(column, packId, categoryId) {
  const effective = getEffectiveGameinfoFormula(column, packId, categoryId);
  return {
    ...effective,
    sourceLabel:
      effective.source === "override"
        ? "สูตรเฉพาะ pack"
        : effective.source === "category"
          ? "สูตรเฉพาะหมวด"
          : effective.source === "game"
            ? "สูตรเฉพาะเกม"
            : effective.source === "manual"
              ? "กรอกเอง"
              : "สูตรหลัก",
  };
}

export function mergeImportedGameinfoFormulaValues(columns, importedColumns) {
  const importedByKey = new Map(
    (importedColumns || []).map((column) => [String(column.key), column])
  );
  return (columns || []).map((column) => {
    const imported = importedByKey.get(String(column.key));
    if (!imported) return column;
    return {
      ...column,
      ...(imported.gameFormula ? { gameFormula: imported.gameFormula } : {}),
      rowOverrides: {
        ...(column.rowOverrides || {}),
        ...(imported.rowOverrides || {}),
      },
    };
  });
}

export function setGameinfoFormulaOverride(columns, columnKey, packId, formula) {
  const cleanFormula = typeof formula === "string" ? formula.trim() : "";
  const id = String(packId);
  return (columns || []).map((column) => {
    if (column.key !== columnKey) return column;
    const rowOverrides = { ...(column.rowOverrides || {}) };
    if (cleanFormula) rowOverrides[id] = cleanFormula;
    else delete rowOverrides[id];
    return { ...column, rowOverrides };
  });
}

export function setGameinfoCategoryFormula(columns, columnKey, categoryId, formula) {
  const cleanFormula = typeof formula === "string" ? formula.trim() : "";
  const id = String(categoryId);
  return (columns || []).map((column) => {
    if (column.key !== columnKey) return column;
    const categoryFormulas = { ...(column.categoryFormulas || {}) };
    if (cleanFormula) categoryFormulas[id] = cleanFormula;
    else delete categoryFormulas[id];
    return { ...column, categoryFormulas };
  });
}

export function duplicateGameinfoFormulaOverrides(columns, sourcePackId, newPackId) {
  const sourceId = String(sourcePackId);
  const targetId = String(newPackId);
  return (columns || []).map((column) => {
    const sourceFormula = column?.rowOverrides?.[sourceId];
    if (typeof sourceFormula !== "string" || !sourceFormula.trim()) return column;
    return {
      ...column,
      rowOverrides: { ...(column.rowOverrides || {}), [targetId]: sourceFormula },
    };
  });
}

export function removeGameinfoFormulaOverridesForPack(columns, packId) {
  const id = String(packId);
  return (columns || []).map((column) => {
    if (!column?.rowOverrides || !(id in column.rowOverrides)) return column;
    const rowOverrides = { ...column.rowOverrides };
    delete rowOverrides[id];
    return { ...column, rowOverrides };
  });
}

export function pruneGameinfoFormulaOverrides(columns, packIds) {
  const known = new Set((packIds || []).map(String));
  return (columns || []).map((column) => {
    const rowOverrides = {};
    for (const [packId, formula] of Object.entries(column?.rowOverrides || {})) {
      if (known.has(packId)) rowOverrides[packId] = formula;
    }
    return { ...column, rowOverrides };
  });
}

export function pruneGameinfoCategoryFormulas(columns, categoryIds) {
  const known = new Set((categoryIds || []).map(String));
  return (columns || []).map((column) => {
    const categoryFormulas = {};
    for (const [categoryId, formula] of Object.entries(column?.categoryFormulas || {})) {
      if (known.has(categoryId)) categoryFormulas[categoryId] = formula;
    }
    return { ...column, categoryFormulas };
  });
}

export function updateGameinfoComputedColumn(columns, nextColumn, { resetOverrides = false } = {}) {
  if (!nextColumn?.key) return columns || [];
  return (columns || []).map((column) => {
    if (column.key !== nextColumn.key) return column;
    return {
      ...column,
      label: nextColumn.label,
      formula: nextColumn.formula,
      // Which of the two the editor wrote is its decision (see the scope
      // control): "every game" puts the text in `formula` and clears this,
      // "this game only" puts it here and leaves `formula` alone.
      gameFormula:
        typeof nextColumn.gameFormula === "string" ? nextColumn.gameFormula : column.gameFormula || "",
      type: nextColumn.type,
      symbol: nextColumn.symbol,
      entryMode: nextColumn.entryMode === "manual" ? "manual" : undefined,
      scopeMode: nextColumn.scopeMode === "category" ? "category" : "global",
      categoryFormulas: resetOverrides ? {} : { ...(column.categoryFormulas || {}) },
      rowOverrides: resetOverrides ? {} : { ...(column.rowOverrides || {}) },
    };
  });
}
