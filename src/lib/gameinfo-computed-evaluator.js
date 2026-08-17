import { evaluateFormula, extractFormulaRefs, parseFormula } from "@/lib/gamedb-formula";
import { GAMEINFO_FIELD_NAMES, resolveGameinfoField } from "@/lib/gameinfo-formula-fields";
import { getGameinfoFormulaDisplay } from "@/lib/gameinfo-formula-overrides";

export function evaluateGameinfoComputedColumn(column, columns, pack, game, context = {}, stack = []) {
  if (!column) return undefined;
  if (stack.includes(column.key)) {
    const labels = [...stack, column.key].map((key) => columns.find((item) => item.key === key)?.label || key);
    throw new Error(`สูตรอ้างอิงวนซ้ำ: ${labels.join(" → ")}`);
  }
  const effective = getGameinfoFormulaDisplay(column, pack?.id);
  const ast = parseFormula(effective.formula);
  return evaluateFormula(ast, (label) => {
    const dependency = columns.find((item) => item.label === label);
    if (dependency) {
      return evaluateGameinfoComputedColumn(dependency, columns, pack, game, context, [...stack, column.key]);
    }
    return resolveGameinfoField(pack, game, label, context);
  });
}

export function validateGameinfoComputedDependencies(columns) {
  const errors = [];
  const labels = new Map();
  for (const column of columns || []) {
    if (labels.has(column.label)) errors.push(`ชื่อคอลัมน์สูตรซ้ำ: ${column.label}`);
    labels.set(column.label, column);
  }
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
      const ast = parseFormula(column.formula);
      for (const ref of extractFormulaRefs(ast)) {
        const dependency = labels.get(ref);
        if (dependency) visit(dependency, [...path, column.label]);
        else if (!GAMEINFO_FIELD_NAMES.includes(ref)) errors.push(`${column.label}: ไม่รู้จักคอลัมน์ ${ref}`);
      }
    } catch (error) {
      errors.push(`${column.label}: ${error instanceof Error ? error.message : "สูตรไม่ถูกต้อง"}`);
    }
    visiting.delete(column.key);
    visited.add(column.key);
  }
  for (const column of columns || []) visit(column, []);
  return [...new Set(errors)];
}
