import { evaluateFormula, extractFormulaRefs, parseFormula } from "@/lib/gamedb-formula";
import { GAMEINFO_FIELD_NAMES, resolveGameinfoField } from "@/lib/gameinfo-formula-fields";
import { getGameinfoFormulaDisplay } from "@/lib/gameinfo-formula-overrides";
import { roundGameinfoNumber } from "@/lib/gameinfo-pack-validation";
import { gameinfoColumnsWithData } from "@/lib/gameinfo-pack-columns";

// One column's formula is the same string for every pack under it, and every
// game now carries every registered column, so a table asks for the same parse
// hundreds of times per render — twice over, since the empty-column pass walks
// the tree before the cells do. Parsing is pure, so the tree is cached by the
// formula text. The cap is there only so a long session cannot accumulate
// every draft a user typed into the formula editor.
const astCache = new Map();
const AST_CACHE_LIMIT = 500;

function parseFormulaCached(formula) {
  const cached = astCache.get(formula);
  if (cached) return cached;
  const ast = parseFormula(formula);
  if (astCache.size >= AST_CACHE_LIMIT) astCache.clear();
  astCache.set(formula, ast);
  return ast;
}

export function evaluateGameinfoComputedColumn(column, columns, pack, game, context = {}, stack = []) {
  if (!column) return undefined;
  if (stack.includes(column.key)) {
    const labels = [...stack, column.key].map((key) => columns.find((item) => item.key === key)?.label || key);
    throw new Error(`สูตรอ้างอิงวนซ้ำ: ${labels.join(" → ")}`);
  }
  const effective = getGameinfoFormulaDisplay(column, pack?.id, context.categoryId);
  if (!effective.formula.trim()) return undefined;
  const ast = parseFormulaCached(effective.formula);
  const value = evaluateFormula(ast, (label) => {
    const dependency = columns.find((item) => item.label === label);
    if (dependency) {
      return evaluateGameinfoComputedColumn(dependency, columns, pack, game, context, [...stack, column.key]);
    }
    return resolveGameinfoField(pack, game, label, context);
  });
  return column.type && column.type !== "number" ? value : roundGameinfoNumber(value);
}

// Columns are shared by every game, so most games have nothing to put in most
// of them. This walks the whole currency/category/pack tree once and reports
// which columns actually produce a value here, so the read-only view can drop
// the empty ones and the editor can offer to. A formula that throws for one
// pack is treated as no value for that pack, not as an error — the cell
// already renders that way.
export function gameinfoColumnsWithDataInGame(packColumns, currencies, game, context = {}) {
  const computedColumns = (packColumns || [])
    .filter((column) => column.kind === "computed")
    .map((column) => column.computed);
  const entries = [];
  for (const currency of currencies || []) {
    for (const category of currency.categories || []) {
      for (const pack of category.packs || []) entries.push({ pack, categoryId: category.id });
    }
  }
  return gameinfoColumnsWithData(packColumns, entries, (column, entry) => {
    try {
      return evaluateGameinfoComputedColumn(column.computed, computedColumns, entry.pack, game, {
        ...context,
        categoryId: entry.categoryId,
      });
    } catch {
      return undefined;
    }
  });
}

export function validateGameinfoComputedDependencies(
  columns,
  extraFieldNames = [],
  { packCategoryIds = {} } = {}
) {
  const errors = [];
  const labels = new Map();
  const normalizedLabels = new Map();
  const reservedNames = new Set(
    [...GAMEINFO_FIELD_NAMES, ...extraFieldNames].map((name) => String(name).trim().toLocaleLowerCase("th"))
  );
  for (const column of columns || []) {
    const normalizedLabel = String(column.label || "").trim().toLocaleLowerCase("th");
    if (reservedNames.has(normalizedLabel)) errors.push(`มีชื่อ "${column.label}" อยู่แล้วในตัวแปรหรือฟิลด์ GameInfo`);
    if (normalizedLabels.has(normalizedLabel)) errors.push(`ชื่อคอลัมน์สูตรซ้ำ: ${column.label}`);
    normalizedLabels.set(normalizedLabel, column);
    labels.set(column.label, column);
  }

  function validateFormula(column, formula, sourceLabel) {
    // A shared registry formula may intentionally be blank when this game
    // supplies `gameFormula` or per-Pack overrides. Blank means "no rule at
    // this scope", not a parser input.
    if (!String(formula || "").trim()) return;
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
    // Only when the game has one: an empty gameFormula means "compute this the
    // way every other game does", not an empty formula to complain about.
    if (String(column.gameFormula || "").trim()) {
      validateFormula(column, column.gameFormula, "สูตรเฉพาะเกม");
    }
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
        if (effective.formula.trim()) {
          const ast = parseFormula(effective.formula);
          for (const ref of extractFormulaRefs(ast)) {
            const dependency = labels.get(ref);
            if (dependency) visit(dependency, [...path, column.label]);
          }
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
