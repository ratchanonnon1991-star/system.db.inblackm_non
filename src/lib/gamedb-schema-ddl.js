// Building blocks for the two DDL statements /createdb is allowed to issue:
// CREATE TABLE and ALTER TABLE ... ADD COLUMN. Deliberately not "any DDL" --
// DROP/ALTER TYPE/RENAME can destroy data or break every query that already
// names a column, with no undo the way an edit-log revert has for a row.
//
// Shared between the client (so the preview shown before confirming is
// exactly what will run, not a description of it) and the server (which
// executes it) -- one function, not two copies that could drift apart.
import { isSafeIdentifier, isSafeIdentifierPart, quoteIdentifier } from "@/lib/gamedb-identifier";

// A fixed list, not a free-text type box: the column type reaches SQL as
// literal text with no quoting to lean on, so it has to come from a set
// this code wrote, never from what a caller typed.
export const DDL_COLUMN_TYPES = [
  { value: "text", label: "ข้อความยาว (text)", sql: "TEXT" },
  { value: "varchar255", label: "ข้อความสั้น (varchar 255)", sql: "VARCHAR(255)" },
  { value: "integer", label: "จำนวนเต็ม (integer)", sql: "INTEGER" },
  { value: "bigint", label: "จำนวนเต็มยาว (bigint)", sql: "BIGINT" },
  { value: "numeric", label: "ทศนิยม (numeric 12,2)", sql: "NUMERIC(12,2)" },
  { value: "boolean", label: "จริง/เท็จ (boolean)", sql: "BOOLEAN" },
  { value: "date", label: "วันที่ (date)", sql: "DATE" },
  { value: "timestamptz", label: "วันเวลา (timestamptz)", sql: "TIMESTAMPTZ" },
  { value: "jsonb", label: "JSON (jsonb)", sql: "JSONB" },
  { value: "uuid", label: "UUID", sql: "UUID" },
];

function sqlForType(value) {
  const found = DDL_COLUMN_TYPES.find((type) => type.value === value);
  if (!found) {
    const err = new Error(`ชนิดคอลัมน์ไม่ถูกต้อง: ${value}`);
    err.status = 400;
    throw err;
  }
  return found.sql;
}

const MAX_COLUMNS = 40;

/**
 * `CREATE TABLE schema.table (col type [NOT NULL], ..., [PRIMARY KEY (col)])`.
 * NOT NULL is fine here -- the table starts empty, so there is no existing
 * row for a new required column to violate the way there would be on ADD
 * COLUMN.
 */
export function buildCreateTableSql({ table, columns, primaryKeyColumn = "" }) {
  if (!isSafeIdentifier(table)) {
    const err = new Error(`ชื่อตารางไม่ถูกต้อง: ${table}`);
    err.status = 400;
    throw err;
  }
  const list = Array.isArray(columns) ? columns.slice(0, MAX_COLUMNS) : [];
  if (list.length === 0) {
    const err = new Error("ต้องมีอย่างน้อย 1 คอลัมน์");
    err.status = 400;
    throw err;
  }
  const seen = new Set();
  const lines = list.map((column) => {
    if (!isSafeIdentifierPart(column.name)) {
      const err = new Error(`ชื่อคอลัมน์ไม่ถูกต้อง: ${column.name}`);
      err.status = 400;
      throw err;
    }
    const key = column.name.toLowerCase();
    if (seen.has(key)) {
      const err = new Error(`ชื่อคอลัมน์ซ้ำ: ${column.name}`);
      err.status = 400;
      throw err;
    }
    seen.add(key);
    const sqlType = sqlForType(column.type);
    return `  ${quoteIdentifier(column.name)} ${sqlType}${column.notNull ? " NOT NULL" : ""}`;
  });
  if (primaryKeyColumn && !list.some((column) => column.name === primaryKeyColumn)) {
    const err = new Error(`คอลัมน์ key "${primaryKeyColumn}" ไม่อยู่ในรายการคอลัมน์`);
    err.status = 400;
    throw err;
  }
  if (primaryKeyColumn) lines.push(`  PRIMARY KEY (${quoteIdentifier(primaryKeyColumn)})`);
  return `CREATE TABLE ${quoteIdentifier(table)} (\n${lines.join(",\n")}\n)`;
}

/**
 * `ALTER TABLE schema.table ADD COLUMN col type`. Always nullable, on
 * purpose -- a NOT NULL column added to a table that already has rows fails
 * outright without a default, and a default here would mean either a
 * hardcoded value applied to every existing row or a free-text default
 * expression reaching SQL unvalidated. Simplest safe answer: always add
 * nullable, let an admin tighten it by hand once it is filled in if they
 * want to.
 */
export function buildAddColumnSql({ table, column, type }) {
  if (!isSafeIdentifier(table)) {
    const err = new Error(`ชื่อตารางไม่ถูกต้อง: ${table}`);
    err.status = 400;
    throw err;
  }
  if (!isSafeIdentifierPart(column)) {
    const err = new Error(`ชื่อคอลัมน์ไม่ถูกต้อง: ${column}`);
    err.status = 400;
    throw err;
  }
  const sqlType = sqlForType(type);
  return `ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} ${sqlType}`;
}
