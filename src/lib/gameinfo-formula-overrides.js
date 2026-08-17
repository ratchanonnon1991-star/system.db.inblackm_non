export function getEffectiveGameinfoFormula(column, packId) {
  const override = column?.rowOverrides?.[String(packId)];
  if (typeof override === "string" && override.trim()) {
    return { formula: override, overridden: true };
  }
  return { formula: typeof column?.formula === "string" ? column.formula : "", overridden: false };
}

// Task 8's formula-display mode needs the exact same effective formula as
// the evaluator plus a stable source label. Keeping this here prevents the
// editor and read-only view from disagreeing about inherited vs overridden.
export function getGameinfoFormulaDisplay(column, packId) {
  const effective = getEffectiveGameinfoFormula(column, packId);
  return {
    ...effective,
    source: effective.overridden ? "override" : "main",
    sourceLabel: effective.overridden ? "สูตรเฉพาะ pack" : "สูตรหลัก",
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
      rowOverrides: resetOverrides ? {} : { ...(column.rowOverrides || {}) },
    };
  });
}
