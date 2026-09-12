import { extractFormulaRefs, parseFormula } from "@/lib/gamedb-formula";

export function gameinfoFormulaReferencesLabel(formula, label) {
  const source = String(formula || "").trim();
  if (!source || !label) return false;
  try {
    return extractFormulaRefs(parseFormula(source)).has(label);
  } catch {
    return false;
  }
}

export function listGameinfoColumnReferences(columns, targetKey, targetLabel, context = {}) {
  const references = [];
  const categories = new Map();
  const packs = new Map();
  for (const currency of context.currencies || []) {
    for (const category of currency.categories || []) {
      categories.set(String(category.id), category.name || String(category.id));
      for (const pack of category.packs || []) {
        packs.set(String(pack.id), pack.name || String(pack.id));
      }
    }
  }
  const push = (column, scope, detail = {}) => references.push({
    gameId: context.gameId,
    gameName: context.gameName || `เกม ${context.gameId}`,
    dataMode: context.dataMode || "uid",
    columnKey: column.key,
    columnLabel: column.label,
    scope,
    ...detail,
  });
  for (const column of columns || []) {
    if (String(column.key) === String(targetKey)) continue;
    if (context.includeShared && gameinfoFormulaReferencesLabel(column.formula, targetLabel)) {
      push(column, "column");
    }
    if (gameinfoFormulaReferencesLabel(column.gameFormula, targetLabel)) {
      push(column, "game");
    }
    for (const [categoryId, formula] of Object.entries(column.categoryFormulas || {})) {
      if (gameinfoFormulaReferencesLabel(formula, targetLabel)) {
        push(column, "category", {
          categoryId,
          categoryName: categories.get(String(categoryId)) || String(categoryId),
        });
      }
    }
    for (const [packId, formula] of Object.entries(column.rowOverrides || {})) {
      if (gameinfoFormulaReferencesLabel(formula, targetLabel)) {
        push(column, "pack", {
          packId,
          packName: packs.get(String(packId)) || String(packId),
        });
      }
    }
  }
  return references;
}

export function clearGameinfoColumnReferences(columns, targetKey, targetLabel) {
  return (columns || [])
    .filter((column) => String(column.key) !== String(targetKey))
    .map((column) => {
      const next = { ...column };
      if (gameinfoFormulaReferencesLabel(next.formula, targetLabel)) {
        next.formula = "";
        next.entryMode = "manual";
      }
      if (gameinfoFormulaReferencesLabel(next.gameFormula, targetLabel)) {
        next.gameFormula = "";
        next.gameEntryMode = "manual";
      }
      next.categoryFormulas = Object.fromEntries(
        Object.entries(next.categoryFormulas || {}).filter(([, formula]) =>
          !gameinfoFormulaReferencesLabel(formula, targetLabel)
        )
      );
      next.rowOverrides = Object.fromEntries(
        Object.entries(next.rowOverrides || {}).filter(([, formula]) =>
          !gameinfoFormulaReferencesLabel(formula, targetLabel)
        )
      );
      return next;
    });
}

export function formatGameinfoColumnReference(reference) {
  const mode = reference.dataMode === "all"
    ? ""
    : reference.dataMode === "idpass" ? " (ID+PASS)" : " (UID)";
  const location = reference.scope === "pack"
    ? `Pack “${reference.packName}”`
    : reference.scope === "category"
      ? `หมวด “${reference.categoryName}”`
      : reference.scope === "game"
        ? "สูตรทั้งคอลัมน์ของเกม"
        : reference.scope === "market"
          ? `Market “${reference.market}”`
        : "สูตรกลางของคอลัมน์";
  return `${reference.gameName}${mode} → ${reference.columnLabel} → ${location}`;
}
