// Which pack columns a role sees.
//
// Columns are shared by every game, so a role that only ever works with a few
// of them would otherwise face all of them in every game. Rules are stored per
// column and apply to every game, because that is how they are almost always
// meant; a rule naming one game overrides the global rule for that game alone.
//
// This is a data boundary, not just a screen arrangement: the read-only game
// page strips the hidden columns on the server before the payload is built
// (see stripHiddenGameinfoColumns), so a hidden column's formula and its
// per-pack values never reach the browser. The table-level filter below still
// runs afterwards, so a surface that forgets to strip still draws correctly.
//
// The pack editor is deliberately exempt: it is admin-only, and it saves the
// column list it was given — handing it a filtered one would delete the
// missing definitions from the shared registry for every game.
import { GAMEINFO_PACK_PINNED_COLUMN_ID } from "@/lib/gameinfo-pack-columns";

export const GAMEINFO_COLUMN_ROLES = Object.freeze(["admin", "topup"]);
export const GAMEINFO_COLUMN_ROLE_ALL_GAMES = 0;

/**
 * Rules -> the column keys this role must not see in this game.
 *
 * A rule for the game beats the every-game rule, and only rules that hide
 * something are stored, so a column nobody has ruled on stays visible.
 */
export function hiddenGameinfoColumnKeys(rules, role, gameId) {
  const global = new Map();
  const perGame = new Map();
  for (const rule of rules || []) {
    if (rule.role !== role) continue;
    const ruleGameId = Number(rule.gameId);
    const visible = rule.visible !== false;
    if (ruleGameId === Number(gameId)) perGame.set(rule.columnKey, visible);
    else if (ruleGameId === GAMEINFO_COLUMN_ROLE_ALL_GAMES) global.set(rule.columnKey, visible);
    // Any other game's rule is none of this game's business.
  }
  const hidden = new Set();
  for (const [columnKey, visible] of global) if (!visible) hidden.add(columnKey);
  for (const [columnKey, visible] of perGame) {
    if (visible) hidden.delete(columnKey);
    else hidden.add(columnKey);
  }
  return hidden;
}

/** Drop the columns this role must not see, keeping the pinned one. */
export function filterGameinfoColumnsForRole(columns, hiddenKeys) {
  if (!hiddenKeys?.size) return columns || [];
  return (columns || []).filter((column) => {
    if (column.id === GAMEINFO_PACK_PINNED_COLUMN_ID) return true;
    // Only user-made columns can be hidden by role; the built-in ones are the
    // pack itself — a table without a price is not a table.
    if (column.kind !== "computed") return true;
    return !hiddenKeys.has(column.computed?.key);
  });
}

// What a masked reference reads as. A visible column may name a hidden one in
// its formula, and the read-only view can show formulas instead of results, so
// leaving the name in would announce the column the rule hides.
export const GAMEINFO_HIDDEN_COLUMN_REF = "ซ่อนไว้";

// Refs are [name] with the name trimmed (see the lexer in gamedb-formula.js).
// Brackets inside a "quoted string" are text, not a ref, so they are left
// alone — this walks the formula rather than running a regex over it.
function maskHiddenFormulaRefs(formula, hiddenLabels) {
  if (typeof formula !== "string" || !formula.includes("[")) return formula;
  let masked = "";
  let quote = "";
  for (let index = 0; index < formula.length; index += 1) {
    const character = formula[index];
    if (quote) {
      masked += character;
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      masked += character;
      continue;
    }
    if (character !== "[") {
      masked += character;
      continue;
    }
    const end = formula.indexOf("]", index + 1);
    // An unclosed bracket is a formula that does not parse; keep it verbatim
    // so the error the user sees is still their own.
    if (end === -1) return masked + formula.slice(index);
    const name = formula.slice(index + 1, end);
    masked += hiddenLabels.has(name.trim()) ? `[${GAMEINFO_HIDDEN_COLUMN_REF}]` : `[${name}]`;
    index = end;
  }
  return masked;
}

function maskColumnFormulas(column, hiddenLabels) {
  const mask = (formula) => maskHiddenFormulaRefs(formula, hiddenLabels);
  const maskMap = (map) =>
    Object.fromEntries(Object.entries(map || {}).map(([key, formula]) => [key, mask(formula)]));
  return {
    ...column,
    formula: mask(column?.formula),
    gameFormula: mask(column?.gameFormula),
    categoryFormulas: maskMap(column?.categoryFormulas),
    rowOverrides: maskMap(column?.rowOverrides),
  };
}

/**
 * The column definitions this role may receive at all.
 *
 * Takes the raw `computedColumns` — the shape the registry merge produces —
 * rather than the built table columns, because that is what carries the
 * formula and the typed-in `rowOverrides`. Drop them here and there is nothing
 * left to leak.
 *
 * A visible column whose formula names a hidden one evaluates to nothing for
 * this role, which is the point: its value is the hidden column's value. The
 * name itself is masked in what survives, so the view's "show the formula"
 * mode cannot read it back out.
 */
export function stripHiddenGameinfoColumns(computedColumns, hiddenKeys) {
  const hidden = hiddenKeys instanceof Set ? hiddenKeys : new Set(hiddenKeys || []);
  if (!hidden.size) return computedColumns || [];
  const hiddenLabels = new Set(
    (computedColumns || [])
      .filter((column) => hidden.has(column?.key))
      .map((column) => String(column?.label ?? "").trim())
  );
  return (computedColumns || [])
    .filter((column) => !hidden.has(column?.key))
    .map((column) => maskColumnFormulas(column, hiddenLabels));
}
