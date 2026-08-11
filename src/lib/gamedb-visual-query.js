import { quoteIdentifier } from "@/lib/gamedb-identifier";

export const VISUAL_FILTER_OPS = [
  "eq",
  "neq",
  "contains",
  "startsWith",
  "endsWith",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "isNull",
  "isNotNull",
];

// Ops a single :placeholder can stand in for -- "in" needs several values at
// once and isNull/isNotNull have none at all, so making either "a box the
// viewer fills in" doesn't mean anything the way it does for the rest.
export const VISUAL_FILTER_PARAM_OPS = [
  "eq",
  "neq",
  "contains",
  "startsWith",
  "endsWith",
  "gt",
  "gte",
  "lt",
  "lte",
];

const NAME_START = /[\p{L}\p{M}_]/u;
const NAME_CHAR = /[\p{L}\p{M}\p{N}_]/u;

/** A dedup'd :placeholder name for a filter, derived from its column so the
 * generated SQL reads naturally -- same NAME_START/NAME_CHAR alphabet
 * gamedb-sql-params.js accepts, so a Thai column name works here too. */
function nextParamName(usedNames, column) {
  const cleaned = String(column || "")
    .split("")
    .filter((ch, index) => (index === 0 ? NAME_START : NAME_CHAR).test(ch))
    .join("");
  const base = cleaned || "param";
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
}

function sqlLiteral(value, kind = "text") {
  const text = String(value ?? "").trim();
  if (kind === "number") {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
      const err = new Error(`ค่าตัวเลขไม่ถูกต้อง: ${value}`);
      err.status = 400;
      throw err;
    }
    return text;
  }
  if (kind === "boolean") {
    if (/^(true|1|yes)$/i.test(text)) return "TRUE";
    if (/^(false|0|no)$/i.test(text)) return "FALSE";
    const err = new Error(`ค่าจริง/เท็จไม่ถูกต้อง: ${value}`);
    err.status = 400;
    throw err;
  }
  // E strings behave the same even if a target database changed
  // standard_conforming_strings. Escape slashes and quotes explicitly so a
  // filter value can never end the literal it came in through.
  return `E'${text.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

// Same three characters buildFilterSql's own pattern ops escape, done in SQL
// this time (chr(92) rather than a literal backslash, so it reads the same
// whether or not standard_conforming_strings is on): a viewer's search box
// cannot be pre-escaped the way an admin's saved filter value can, so the
// escaping has to happen where the value actually arrives, at query time.
function sqlEscapeLikeExpr(valueExpr) {
  return (
    `replace(replace(replace(${valueExpr}, chr(92), chr(92) || chr(92)), ` +
    `'%', chr(92) || '%'), '_', chr(92) || '_')`
  );
}

function buildFilterSql(filter, tableAlias, usedParamNames) {
  if (!filter || !VISUAL_FILTER_OPS.includes(filter.op)) return "";
  const rawColumn = String(filter.column || "");
  const column = quoteIdentifier(tableAlias ? `${tableAlias}.${rawColumn}` : rawColumn);
  if (filter.op === "isNull") return `${column} IS NULL`;
  if (filter.op === "isNotNull") return `${column} IS NOT NULL`;

  const asParam = filter.asParam && VISUAL_FILTER_PARAM_OPS.includes(filter.op);
  const paramExpr = asParam ? `:${nextParamName(usedParamNames, rawColumn)}` : null;

  if (filter.op === "in") {
    const values = String(filter.value ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length === 0) {
      const err = new Error(`กรุณาใส่ค่าตัวกรอง "${filter.column}"`);
      err.status = 400;
      throw err;
    }
    return `${column} IN (${values.map((value) => sqlLiteral(value, filter.kind)).join(", ")})`;
  }
  if (["contains", "startsWith", "endsWith"].includes(filter.op)) {
    if (asParam) {
      const escaped = sqlEscapeLikeExpr(paramExpr);
      const pattern =
        filter.op === "contains"
          ? `'%' || ${escaped} || '%'`
          : filter.op === "startsWith"
            ? `${escaped} || '%'`
            : `'%' || ${escaped}`;
      return `CAST(${column} AS text) ILIKE (${pattern})`;
    }
    const raw = String(filter.value ?? "").trim();
    if (!raw) {
      const err = new Error(`กรุณาใส่ค่าตัวกรอง "${filter.column}"`);
      err.status = 400;
      throw err;
    }
    // % and _ are wildcards to ILIKE. Someone typing "50%" means the three
    // characters, not "starts with 50", so they are escaped and only the
    // wildcards this builder adds are left to mean anything.
    const text = raw.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const pattern =
      filter.op === "contains" ? `%${text}%` : filter.op === "startsWith" ? `${text}%` : `%${text}`;
    return `CAST(${column} AS text) ILIKE ${sqlLiteral(pattern)}`;
  }
  const operator = {
    eq: "=",
    neq: "<>",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
  }[filter.op];
  if (asParam) return `${column} ${operator} ${paramExpr}`;
  const value = String(filter.value ?? "").trim();
  if (!value) {
    const err = new Error(`กรุณาใส่ค่าตัวกรอง "${filter.column}"`);
    err.status = 400;
    throw err;
  }
  return `${column} ${operator} ${sqlLiteral(value, filter.kind)}`;
}

export function buildVisualSelect({
  schema,
  table,
  columns,
  filters = [],
  sort = null,
  limit = null,
  joins = [],
}) {
  const selected = [...new Set((columns || []).map(String))];
  if (!schema || !table || selected.length === 0) return "";

  const activeJoins = (joins || []).filter(
    (join) =>
      join &&
      join.schema &&
      join.table &&
      Array.isArray(join.pairs) &&
      join.pairs.length > 0 &&
      Array.isArray(join.columns) &&
      join.columns.length > 0
  );
  const baseAlias = activeJoins.length > 0 ? "t0" : "";
  const selectExpressions = selected.map((column) =>
    quoteIdentifier(baseAlias ? `${baseAlias}.${column}` : column)
  );
  activeJoins.forEach((join, index) => {
    const alias = `t${index + 1}`;
    join.columns.forEach((column) => {
      selectExpressions.push(
        `${quoteIdentifier(`${alias}.${column.name}`)} AS ${quoteIdentifier(String(column.alias))}`
      );
    });
  });

  const from = `${quoteIdentifier(`${schema}.${table}`)}${baseAlias ? ` AS ${quoteIdentifier(baseAlias)}` : ""}`;
  const clauses = [`SELECT\n  ${selectExpressions.join(",\n  ")}\nFROM ${from}`];
  activeJoins.forEach((join, index) => {
    const alias = `t${index + 1}`;
    const on = join.pairs
      .map(
        (pair) =>
          `${quoteIdentifier(`t0.${pair.baseColumn}`)} = ${quoteIdentifier(`${alias}.${pair.joinColumn}`)}`
      )
      .join(" AND ");
    clauses.push(
      `LEFT JOIN ${quoteIdentifier(`${join.schema}.${join.table}`)} AS ${quoteIdentifier(alias)} ON ${on}`
    );
  });
  const usedParamNames = new Set();
  const where = filters
    .map((filter) => buildFilterSql(filter, baseAlias, usedParamNames))
    .filter(Boolean);
  if (where.length > 0) clauses.push(`WHERE\n  ${where.join("\n  AND ")}`);
  if (sort?.column) {
    const sortName = baseAlias ? `${baseAlias}.${sort.column}` : String(sort.column);
    clauses.push(`ORDER BY ${quoteIdentifier(sortName)} ${sort.direction === "desc" ? "DESC" : "ASC"}`);
  }
  if (limit !== null && limit !== undefined && limit !== "") {
    const safeLimit = Math.min(1000, Math.max(1, Math.trunc(Number(limit) || 100)));
    clauses.push(`LIMIT ${safeLimit}`);
  }
  return clauses.join("\n");
}

/**
 * SQL for the "pick a table, tick some columns" side of the add-data form
 * builder — mirrors buildVisualSelect but for INSERT. Every chosen column
 * becomes a :columnName placeholder, so the fields on the resulting form line
 * up 1:1 with the columns without the admin ever typing SQL.
 */
export function buildVisualInsert({ schema, table, columns }) {
  const selected = [...new Set((columns || []).map(String))];
  if (!schema || !table || selected.length === 0) return "";
  const columnList = selected.map((column) => quoteIdentifier(column)).join(", ");
  const paramList = selected.map((column) => `:${column}`).join(", ");
  return `INSERT INTO ${quoteIdentifier(`${schema}.${table}`)} (${columnList})\nVALUES (${paramList})`;
}

export function buildVisualLayout({
  baseLayout,
  schema,
  table,
  primaryKey,
  editableColumns,
  selectedColumns = [],
  columnSettings = {},
  tableTone = "",
}) {
  const columns = [...new Set((editableColumns || []).map(String))];
  const editable =
    schema && table && primaryKey && columns.length > 0
      ? {
          table: `${schema}.${table}`,
          pk: primaryKey,
          pkColumn: primaryKey,
          columns,
          columnMap: {},
          allowInsert: false,
          allowDelete: false,
          inputs: [],
        }
      : null;

  const labels = {};
  const formats = {};
  [...new Set(selectedColumns.map(String))].forEach((column, index) => {
    const id = `c${index}`;
    const setting = columnSettings[column] || {};
    const label = String(setting.label || "").trim();
    if (label && label !== column) labels[id] = label;
    const format = {
      bg: setting.bg || "",
      headerBg: setting.headerBg || "",
      render: setting.render || "text",
      align: setting.align || "",
      wrap: setting.wrap === true,
    };
    if (format.bg || format.headerBg || format.render !== "text" || format.align || format.wrap) {
      formats[id] = format;
    }
  });

  // Everything a layout holds about columns is keyed by result position
  // (`c0`, `c1`, ...), and rebuilding the query in the visual builder moves
  // those positions. Carrying the old keys over would hide, colour or sort a
  // column that is no longer the one they were written for, so only the
  // settings that say nothing about columns survive.
  const { folder = "", refreshSeconds = 0 } = baseLayout || {};
  return { folder, refreshSeconds, labels, formats, tableTone, editable };
}
