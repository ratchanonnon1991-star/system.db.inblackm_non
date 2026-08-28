import { evaluateFormula, extractFormulaRefs, parseFormula } from "@/lib/gamedb-formula";
import { GAMEINFO_FIELD_NAMES, resolveGameinfoField } from "@/lib/gameinfo-formula-fields";
import { getGameinfoFormulaDisplay } from "@/lib/gameinfo-formula-overrides";

export function evaluateGameinfoComputedColumn(column, columns, pack, game, context = {}, stack = []) {
  if (!column) return undefined;
  if (stack.includes(column.key)) {
    const labels = [...stack, column.key].map((key) => columns.find((item) => item.key === key)?.label || key);
    throw new Error(`สูตรอ้างอิงวนซ้ำ: ${labels.join(" → ")}`);
  }
  const effective = getGameinfoFormulaDisplay(column, pack?.id, context.categoryId);
  const ast = parseFormula(effective.formula);
  return evaluateFormula(ast, (label) => {
    const dependency = columns.find((item) => item.label === label);
    if (dependency) {
      return evaluateGameinfoComputedColumn(dependency, columns, pack, game, context, [...stack, column.key]);
    }
    return resolveGameinfoField(pack, game, label, context);
  });
}

export function validateGameinfoComputedDependencies(
  columns,
  extraFieldNames = [],
  { packCategoryIds = {} } = {}
) {
  const errors = [];
  const labels = new Map();
  for (const column of columns || []) {
    if (labels.has(column.label)) errors.push(`ชื่อคอลัมน์สูตรซ้ำ: ${column.label}`);
    labels.set(column.label, column);
  }

  function validateFormula(column, formula, sourceLabel) {
    try {
      const ast = parseFormula(formula);
      for (const ref of extractFormulaRefs(ast)) {
        if (!labels.has(ref) && !GAMEINFO_FIELD_NAMES.includes(ref) && !extraFieldNames.includes(ref)) {
          errors.push(`${column.label} (${sourceLabel}): ไม่รู้จักคอลัมน์ ${ref}`);
        }
      }
    } catch (error) {
      errors.push(`${column.label} (${sourceLabel}): ${error instanceof Error ? error.message : "สูตรไม่ถูกต้อง"}`);
    }
  }

  for (const column of columns || []) {
    validateFormula(column, column.formula, "สูตรหลัก");
    for (const [categoryId, formula] of Object.entries(column.categoryFormulas || {})) {
      validateFormula(column, formula, `สูตรหมวด ${categoryId}`);
    }
    for (const [packId, formula] of Object.entries(column.rowOverrides || {})) {
      validateFormula(column, formula, `สูตร pack ${packId}`);
    }
  }

  const categoryIds = new Set();
  const packIds = new Set();
  for (const column of columns || []) {
    Object.keys(column.categoryFormulas || {}).forEach((id) => categoryIds.add(id));
    Object.keys(column.rowOverrides || {}).forEach((id) => packIds.add(id));
  }
  const contexts = [
    { packId: undefined, categoryId: undefined },
    ...[...categoryIds].map((categoryId) => ({ packId: undefined, categoryId })),
    ...[...packIds].map((packId) => ({ packId, categoryId: packCategoryIds[packId] })),
  ];

  for (const context of contexts) {
    const visiting = new Set();
    const visited = new Set();
    function visit(column, path) {
      if (visiting.has(column.key)) {
        errors.push(`สูตรอ้างอิงวนซ้ำ: ${[...path, column.label].join(" → ")}`);
        return;
      }
      if (visited.has(column.key)) return;
      visiting.add(column.key);
      try {
        const effective = getGameinfoFormulaDisplay(
          column,
          context.packId,
          context.categoryId
        );
        const ast = parseFormula(effective.formula);
        for (const ref of extractFormulaRefs(ast)) {
          const dependency = labels.get(ref);
          if (dependency) visit(dependency, [...path, column.label]);
        }
      } catch {
        // The formula-specific pass above reports syntax and unknown refs.
      }
      visiting.delete(column.key);
      visited.add(column.key);
    }
    for (const column of columns || []) visit(column, []);
  }
  return [...new Set(errors)];
}
