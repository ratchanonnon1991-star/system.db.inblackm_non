export function getEffectiveGameinfoFormula(column, packId, categoryId) {
  const override = column?.rowOverrides?.[String(packId)];
  if (typeof override === "string" && override.trim()) {
    return { formula: override, overridden: true, source: "override" };
  }
  if (column?.entryMode === "manual") {
    return { formula: "", overridden: false, source: "manual" };
  }
  const categoryFormula = column?.categoryFormulas?.[String(categoryId)];
  if (
    column?.scopeMode === "category" &&
    typeof categoryFormula === "string" &&
    categoryFormula.trim()
  ) {
    return { formula: categoryFormula, overridden: true, source: "category" };
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
          : effective.source === "manual"
            ? "กรอกเอง"
            : "สูตรหลัก",
  };
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
      type: nextColumn.type,
      symbol: nextColumn.symbol,
      entryMode: nextColumn.entryMode === "manual" ? "manual" : undefined,
      scopeMode: nextColumn.scopeMode === "category" ? "category" : "global",
      categoryFormulas: resetOverrides ? {} : { ...(column.categoryFormulas || {}) },
      rowOverrides: resetOverrides ? {} : { ...(column.rowOverrides || {}) },
    };
  });
}
