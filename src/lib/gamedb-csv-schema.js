// Turning a spreadsheet someone already has into a table they can create.
//
// Most people arrive with the data already sitting in Excel, so making them
// retype every column name and pick every type by hand is the slowest possible
// path to a table that already exists in front of them. This reads a CSV's
// header row plus a sample of its values and proposes the column list --
// always as a proposal, never applied directly: /createdb still shows the
// DDL and waits for a confirm, so a wrong guess costs one dropdown change.
import { isSafeIdentifierPart } from "@/lib/gamedb-identifier";

// How many rows to look at before deciding a type. Reading the whole file
// would make a large export slow to no purpose -- a column that is integers
// for 200 rows and text on row 5,000 is rare, and the preview is editable.
export const TYPE_SAMPLE_ROWS = 200;

/**
 * A header cell turned into something Postgres will accept unquoted-ish.
 * Thai names are fine (see isSafeIdentifierPart), so this only has to strip
 * what would break the quoted identifier itself, collapse whitespace, and
 * keep the result inside the 63-byte identifier limit.
 */
export function toColumnName(header, fallbackIndex = 0) {
  const cleaned = String(header ?? "")
    .replace(/["\\\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 63);
  if (cleaned && isSafeIdentifierPart(cleaned)) return cleaned;
  // A header that is empty, or made entirely of characters that cannot live
  // in an identifier, still needs a usable name rather than a failed import.
  const stripped = cleaned.replace(/[^\p{L}\p{M}\p{N}_$ -]/gu, "").trim();
  return stripped && isSafeIdentifierPart(stripped) ? stripped : `column_${fallbackIndex + 1}`;
}

const BOOLEAN_WORDS = new Set(["true", "false", "t", "f", "yes", "no", "y", "n", "ใช่", "ไม่ใช่"]);

function looksLikeInteger(value) {
  return /^-?\d{1,18}$/.test(value);
}

function looksLikeNumber(value) {
  // Thousands separators are normal in a spreadsheet export.
  return /^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(value) || /^-?\d+(\.\d+)?$/.test(value);
}

function looksLikeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value);
}

function looksLikeTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/.test(value);
}

/**
 * The DDL type to propose for one column, from the values actually present.
 *
 * Blank cells are ignored rather than counted against a type -- an otherwise
 * clean integer column with a few gaps is still an integer column. If nothing
 * fits every non-blank value, text always does, so this never fails.
 */
export function guessColumnType(values) {
  const present = values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value !== "");
  if (present.length === 0) return "text";

  if (present.every((value) => BOOLEAN_WORDS.has(value.toLowerCase()))) return "boolean";
  if (present.every(looksLikeTimestamp)) return "timestamptz";
  if (present.every(looksLikeDate)) return "date";
  if (present.every(looksLikeInteger)) {
    // Past 2^31 an INTEGER column would reject the very data being imported.
    const tooBig = present.some((value) => Math.abs(Number(value)) > 2147483647);
    return tooBig ? "bigint" : "integer";
  }
  if (present.every(looksLikeNumber)) return "numeric";
  // A long free-text column would be truncated by VARCHAR(255).
  const longest = present.reduce((max, value) => Math.max(max, value.length), 0);
  return longest > 255 ? "text" : "varchar255";
}

/**
 * The whole proposed column list for a parsed CSV.
 *
 * `notNull` is proposed only for a column with no blanks at all in the
 * sample -- claiming a column is required when the file itself has gaps
 * would make the CREATE TABLE succeed and the first import fail.
 */
export function guessColumnsFromCsv({ headers, rows }) {
  const sample = (rows || []).slice(0, TYPE_SAMPLE_ROWS);
  const used = new Set();
  return (headers || []).map((header, index) => {
    let name = toColumnName(header, index);
    // Two headers reading "ชื่อ" and "ชื่อ " collapse to the same identifier,
    // which CREATE TABLE rejects outright -- number the later ones instead.
    if (used.has(name.toLowerCase())) {
      let suffix = 2;
      while (used.has(`${name} ${suffix}`.toLowerCase())) suffix += 1;
      name = `${name} ${suffix}`.slice(0, 63);
    }
    used.add(name.toLowerCase());

    const values = sample.map((row) => row[header]);
    return {
      name,
      type: guessColumnType(values),
      notNull:
        sample.length > 0 &&
        values.every((value) => String(value ?? "").trim() !== ""),
      sourceHeader: String(header ?? ""),
    };
  });
}
