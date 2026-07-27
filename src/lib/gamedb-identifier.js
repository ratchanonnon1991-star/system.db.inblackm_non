// Table and column names reach the writer from a saved config, never straight
// from a request, but they are still checked here before being quoted into SQL.
//
// Thai identifiers are normal in this database, so the rule is Unicode letters,
// marks and digits (plus _ $ space -), not [A-Za-z]. \p{M} matters: Thai vowel
// and tone signs such as the ื and ่ in "ชื่อ" are combining marks, so a
// letters-only class rejects perfectly ordinary column names. Anything that
// could end the quoted identifier — a double quote, a backslash, a control
// character — is what actually has to be kept out.
const PART = /^[\p{L}\p{M}\p{N}_$ -]{1,63}$/u;

export function isSafeIdentifierPart(part) {
  return typeof part === "string" && PART.test(part);
}

/** `table` or `schema.table` — at most one dot. */
export function isSafeIdentifier(name) {
  if (typeof name !== "string" || !name) return false;
  const parts = name.split(".");
  return parts.length <= 2 && parts.every(isSafeIdentifierPart);
}

export function quoteIdentifier(name) {
  if (!isSafeIdentifier(name)) {
    const err = new Error(`ชื่อตาราง/คอลัมน์ไม่ถูกต้อง: ${name}`);
    err.status = 400;
    throw err;
  }
  return name
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
}
