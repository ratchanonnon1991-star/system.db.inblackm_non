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
import { parseFormula } from "@/lib/gamedb-formula";
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
 * Extra headers + the packs each row produced -> columns to write.
 *
 * `existingColumns` are the registered columns; a header matching one by label
 * fills that column in for this game rather than creating a second column with
 * the same name. Row numbers in errors are 1-based over the data rows the
 * caller passed, offset so they match the spreadsheet (header row = 1).
 */
export function buildGameinfoCsvColumns(headers, rowPacks, existingColumns = []) {
  const extras = gameinfoCsvExtraHeaders(headers);
  const byLabel = new Map(
    (existingColumns || []).map((column) => [String(column.label).trim(), column])
  );
  const columns = [];
  const errors = [];
  const now = Date.now();

  extras.forEach((header, index) => {
    const existing = byLabel.get(header.trim());
    const cells = [];
    for (const entry of rowPacks || []) {
      const formula = gameinfoCsvCellToFormula(entry.row?.[header]);
      if (!formula) continue;
      if (looksLikeFormula(formula)) {
        try {
          parseFormula(formula);
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
      key: existing?.key || `col_${now}_${index}`,
      label: header,
      isNew: !existing,
      // A header with no values under it is a column the user wants to fill in
      // later — create it empty rather than refusing it.
      formula: promoted,
      entryMode: promoted ? "formula" : "manual",
      valueCount: cells.length,
      rowOverrides,
    });
  });

  return { columns, errors };
}
