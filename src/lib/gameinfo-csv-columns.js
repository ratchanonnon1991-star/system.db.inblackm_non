// CSV headers the pack importer does not recognise used to reject the whole
// file. They now describe columns: a header that matches a registered column
// fills that column in, and one that matches nothing proposes a new column for
// the user to confirm in the import preview.
//
// A cell can hold a value or a formula, with no new syntax to learn, because
// "typed in by hand" is already stored as a formula — a bare number is a valid
// one. So `1500` and `[ราคา] * 1.05` both just work, and a column whose cells
// are all the same formula is offered as a column-level formula instead of the
// same text repeated on every pack.
import { extractFormulaRefs, parseFormula } from "@/lib/gamedb-formula";
import { GAMEINFO_FIELD_NAMES } from "@/lib/gameinfo-formula-fields";
import { PACK_HEADERS } from "@/lib/gameinfo-import";

// `amount_charged` is a retired column that is still accepted-and-ignored with
// a warning, so it must not be mistaken for someone naming a new column.
const RETIRED_HEADERS = ["amount_charged"];

export function gameinfoCsvExtraHeaders(headers) {
  return (headers || []).filter(
    (header) =>
      header &&
      !PACK_HEADERS.includes(header) &&
      !RETIRED_HEADERS.includes(header)
  );
}

// One cell -> the formula string stored for that pack.
//
// Values arrive from a spreadsheet, so most are not valid formulas on their
// own: "ข้อมูล" is text and "1,000" is a number Excel has punctuated. Text is
// quoted into a string literal and thousands separators are dropped, which
// leaves the two cases users actually write — a number and a bracketed
// formula — untouched.
export function gameinfoCsvCellToFormula(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (value.includes("[")) return value;
  const unpunctuated = value.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(unpunctuated)) return unpunctuated;
  return `"${value.replace(/"/g, '""')}"`;
}

function looksLikeFormula(value) {
  return String(value ?? "").includes("[");
}

/**
 * Mints the key for a column this file introduces.
 *
 * One allocator serves the whole file, because a header is one column across
 * every game in it: minting per game gave the same header a different key
 * whenever two games were built either side of a millisecond, and the apply
 * route keeps a game's columns by key, so every game but the first lost its
 * column and the per-pack formulas it carried.
 */
export function createGameinfoCsvColumnKeys() {
  const byLabel = new Map();
  return (label) => {
    if (!byLabel.has(label)) byLabel.set(label, `col_${Date.now()}_${byLabel.size}`);
    return byLabel.get(label);
  };
}

/**
 * Extra headers + the packs each row produced -> columns to write.
 *
 * `existingColumns` are the registered columns; a header matching one by label
 * fills that column in for this game rather than creating a second column with
 * the same name. Row numbers in errors are 1-based over the data rows the
 * caller passed, offset so they match the spreadsheet (header row = 1).
 */
export function buildGameinfoCsvColumns(
  headers,
  rowPacks,
  existingColumns = [],
  knownNames = [],
  newColumnKey = createGameinfoCsvColumnKeys()
) {
  const extras = gameinfoCsvExtraHeaders(headers);
  const byLabel = new Map(
    (existingColumns || []).map((column) => [String(column.label).trim(), column])
  );
  // What a formula in this file may refer to: the built-in pack fields, the
  // formula variables, every registered column, and the other columns this
  // same file introduces.
  const resolvable = new Set([
    ...GAMEINFO_FIELD_NAMES,
    ...(knownNames || []),
    ...(existingColumns || []).map((column) => String(column.label).trim()),
    ...extras.map((header) => header.trim()),
  ]);
  const columns = [];
  const errors = [];

  extras.forEach((header) => {
    const existing = byLabel.get(header.trim());
    const cells = [];
    const unknownRefs = new Set();
    for (const entry of rowPacks || []) {
      const formula = gameinfoCsvCellToFormula(entry.row?.[header]);
      if (!formula) continue;
      if (looksLikeFormula(formula)) {
        try {
          // A name in brackets that nothing answers to is not a syntax error —
          // it parses and then quietly evaluates to nothing. Collect those so
          // the preview can say which names it did not recognise instead of
          // importing a column that will render blank forever.
          for (const ref of extractFormulaRefs(parseFormula(formula))) {
            if (!resolvable.has(ref)) unknownRefs.add(ref);
          }
        } catch (error) {
          errors.push(
            `คอลัมน์ "${header}" แถวของ pack "${entry.row?.pack_name || entry.packId}": ${error.message}`
          );
          continue;
        }
      }
      cells.push({ packId: entry.packId, formula });
    }

    // Every pack carrying the same formula is one rule, not N copies of it.
    // Only formulas are promoted: repeated plain values are far more likely to
    // be a coincidence than an intention.
    const distinct = new Set(cells.map((cell) => cell.formula));
    const promoted =
      cells.length > 1 && distinct.size === 1 && looksLikeFormula(cells[0].formula)
        ? cells[0].formula
        : "";

    const rowOverrides = {};
    if (!promoted) for (const cell of cells) rowOverrides[cell.packId] = cell.formula;

    columns.push({
      key: existing?.key || newColumnKey(header.trim()),
      label: header,
      isNew: !existing,
      // A header with no values under it is a column the user wants to fill in
      // later — create it empty rather than refusing it.
      //
      // The rule this file states belongs to *this game*, never to the column:
      // a column definition is shared by every game, so writing it there would
      // make "the formula I put next to my game's packs" the formula all 216
      // games compute. It rides as gameFormula, which is exactly the layer the
      // registry added for a game that computes a shared column differently.
      formula: "",
      gameFormula: promoted,
      entryMode: promoted ? "formula" : "manual",
      valueCount: cells.length,
      unknownRefs: [...unknownRefs],
      rowOverrides,
    });
  });

  return { columns, errors };
}
