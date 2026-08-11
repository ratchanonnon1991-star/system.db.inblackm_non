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

function buildFilterSql(filter) {
  if (!filter || !VISUAL_FILTER_OPS.includes(filter.op)) return "";
  const column = quoteIdentifier(String(filter.column || ""));
  if (filter.op === "isNull") return `${column} IS NULL`;
  if (filter.op === "isNotNull") return `${column} IS NOT NULL`;
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
    const raw = String(filter.value ?? "").trim();
    if (!raw) {
      const err = new Error(`กรุณาใส่ค่าตัวกรอง "${filter.column}"`);
      err.status = 400;
      throw err;
    }
    const pattern =
      filter.op === "contains" ? `%${raw}%` : filter.op === "startsWith" ? `${raw}%` : `%${raw}`;
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
  const value = String(filter.value ?? "").trim();
  if (!value) {
    const err = new Error(`กรุณาใส่ค่าตัวกรอง "${filter.column}"`);
    err.status = 400;
    throw err;
  }
  return `${column} ${operator} ${sqlLiteral(value, filter.kind)}`;
}

export function buildVisualSelect({ schema, table, columns, filters = [], sort = null, limit = null }) {
  const selected = [...new Set((columns || []).map(String))];
  if (!schema || !table || selected.length === 0) return "";

  const clauses = [
    `SELECT\n  ${selected.map((column) => quoteIdentifier(column)).join(",\n  ")}\nFROM ${quoteIdentifier(`${schema}.${table}`)}`,
  ];
  const where = filters.map(buildFilterSql).filter(Boolean);
  if (where.length > 0) clauses.push(`WHERE\n  ${where.join("\n  AND ")}`);
  if (sort?.column) {
    clauses.push(`ORDER BY ${quoteIdentifier(String(sort.column))} ${sort.direction === "desc" ? "DESC" : "ASC"}`);
  }
  if (limit !== null && limit !== undefined && limit !== "") {
    const safeLimit = Math.min(1000, Math.max(1, Math.trunc(Number(limit) || 100)));
    clauses.push(`LIMIT ${safeLimit}`);
  }
  return clauses.join("\n");
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

  const labels = { ...((baseLayout || {}).labels || {}) };
  const formats = { ...((baseLayout || {}).formats || {}) };
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

  return { ...(baseLayout || {}), labels, formats, tableTone, editable };
}
