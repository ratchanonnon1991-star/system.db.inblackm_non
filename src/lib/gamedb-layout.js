// Helpers shared by the table panels: layout shape, cell formatting and the
// display-column list that mixes SQL result columns with computed columns.
import { parseFormula } from "@/lib/gamedb-formula";

// Everything configurable about a saved query lives in this one JSONB column:
// the app connects as a role that does not own gamedb_queries, so adding real
// columns for each new feature is not an option.
export const EMPTY_LAYOUT = {
  order: [],
  hidden: [],
  labels: {},
  computed: [],
  widths: {},
  params: [],
  editable: null,
  rules: [],
  summary: {},
  chart: null,
  sort: null,
  refreshSeconds: 0,
};

export const PARAM_TYPES = ["text", "number", "date", "select"];
export const RULE_OPS = [">", ">=", "<", "<=", "=", "!=", "contains"];
export const RULE_TONES = ["red", "amber", "green", "blue", "bar"];
export const SUMMARY_KINDS = ["sum", "avg", "min", "max", "count"];
export const REFRESH_CHOICES = [0, 15, 30, 60, 300, 900];

export const MIN_COLUMN_WIDTH = 56;
export const MAX_COLUMN_WIDTH = 900;
// Cap the auto-measured width so one long text column cannot push every other
// column off screen on first render.
export const MAX_NATURAL_WIDTH = 380;
export const ROW_NUMBER_WIDTH = 46;

export function clampColumnWidth(value) {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, value)));
}

export function normalizeLayout(raw) {
  const layout = raw && typeof raw === "object" ? raw : {};
  const widths = {};
  if (layout.widths && typeof layout.widths === "object") {
    for (const [key, value] of Object.entries(layout.widths)) {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) widths[key] = clampColumnWidth(num);
    }
  }
  const summary = {};
  if (layout.summary && typeof layout.summary === "object") {
    for (const [key, kind] of Object.entries(layout.summary)) {
      if (SUMMARY_KINDS.includes(kind)) summary[key] = kind;
    }
  }
  const editable =
    layout.editable && typeof layout.editable === "object" && layout.editable.table
      ? {
          table: String(layout.editable.table),
          pk: String(layout.editable.pk || ""),
          columns: Array.isArray(layout.editable.columns)
            ? layout.editable.columns.map(String)
            : [],
        }
      : null;
  const chart =
    layout.chart && typeof layout.chart === "object" && layout.chart.x
      ? {
          type: layout.chart.type === "line" ? "line" : "bar",
          x: String(layout.chart.x),
          y: Array.isArray(layout.chart.y) ? layout.chart.y.map(String) : [],
        }
      : null;
  const sort =
    layout.sort && typeof layout.sort === "object" && layout.sort.colId
      ? { colId: String(layout.sort.colId), dir: layout.sort.dir === "desc" ? "desc" : "asc" }
      : null;

  return {
    order: Array.isArray(layout.order) ? layout.order : [],
    hidden: Array.isArray(layout.hidden) ? layout.hidden : [],
    labels:
      layout.labels && typeof layout.labels === "object" ? layout.labels : {},
    computed: Array.isArray(layout.computed) ? layout.computed : [],
    widths,
    params: Array.isArray(layout.params)
      ? layout.params
          .filter((param) => param && typeof param.name === "string")
          .map((param) => ({
            name: param.name,
            label: String(param.label || param.name),
            type: PARAM_TYPES.includes(param.type) ? param.type : "text",
            defaultValue: param.defaultValue == null ? "" : String(param.defaultValue),
            options: Array.isArray(param.options) ? param.options.map(String) : [],
          }))
      : [],
    editable,
    rules: Array.isArray(layout.rules)
      ? layout.rules
          .filter(
            (rule) =>
              rule &&
              typeof rule.colId === "string" &&
              RULE_OPS.includes(rule.op) &&
              RULE_TONES.includes(rule.tone)
          )
          .map((rule) => ({
            colId: rule.colId,
            op: rule.op,
            value: String(rule.value ?? ""),
            tone: rule.tone,
          }))
      : [],
    summary,
    chart,
    sort,
    refreshSeconds: REFRESH_CHOICES.includes(Number(layout.refreshSeconds))
      ? Number(layout.refreshSeconds)
      : 0,
  };
}

export function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function formatCell(value, type) {
  if (value === null || value === undefined) return "—";
  if (type === "number") {
    const num = toNumber(value);
    if (num === null) return String(value);
    return num.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  }
  if (type === "datetime") {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }
  if (type === "date") {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("th-TH");
  }
  if (type === "boolean") return value ? "✓" : "✗";
  return String(value);
}

/** Sort helper for display rows: numbers numerically, nulls always last. */
export function compareCells(a, b) {
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const aNum = toNumber(a);
  const bNum = toNumber(b);
  if (aNum !== null && bNum !== null) return aNum - bNum;
  return String(a).localeCompare(String(b), "th");
}

export function summarize(kind, values) {
  const numbers = values.map(toNumber).filter((num) => num !== null);
  if (kind === "count") return values.filter((v) => v !== null && v !== "").length;
  if (!numbers.length) return null;
  if (kind === "sum") return numbers.reduce((sum, num) => sum + num, 0);
  if (kind === "avg") return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  if (kind === "min") return Math.min(...numbers);
  if (kind === "max") return Math.max(...numbers);
  return null;
}

export const SUMMARY_LABELS = {
  sum: "รวม",
  avg: "เฉลี่ย",
  min: "ต่ำสุด",
  max: "สูงสุด",
  count: "นับ",
};

export const TONE_CELL_CLASS = {
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-emerald-50 text-emerald-700",
  blue: "bg-sky-50 text-sky-700",
  bar: "",
};

export const TONE_LABELS = {
  red: "แดง",
  amber: "ส้ม",
  green: "เขียว",
  blue: "ฟ้า",
  bar: "แถบวัดระดับ",
};

export function ruleMatches(rule, raw, text) {
  if (rule.op === "contains") {
    return String(text ?? "").toLowerCase().includes(String(rule.value).toLowerCase());
  }
  const left = toNumber(raw);
  const right = toNumber(rule.value);
  if (left === null || right === null) {
    if (rule.op === "=") return String(text ?? "") === String(rule.value);
    if (rule.op === "!=") return String(text ?? "") !== String(rule.value);
    return false;
  }
  switch (rule.op) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    default:
      return false;
  }
}

/** Excel opens UTF-8 CSV correctly only with the BOM, and Thai text needs it. */
export function rowsToCsv(headers, rows) {
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return `﻿${lines.join("\r\n")}`;
}

// Display columns mix base result columns (id = name) and computed columns
// (id = "#key") so layout order/hidden/labels/widths can address both kinds.
export function buildDisplayColumns(resultColumns, layout) {
  const base = resultColumns.map((col) => ({
    id: col.name,
    label: layout.labels[col.name] || col.name,
    type: col.type,
    kind: "base",
    column: col,
  }));
  const computed = layout.computed.map((col) => {
    let ast = null;
    let formulaError = "";
    try {
      ast = parseFormula(col.formula);
    } catch (err) {
      formulaError = err.message;
    }
    return {
      id: `#${col.key}`,
      label: layout.labels[`#${col.key}`] || col.label,
      type: "number",
      kind: "computed",
      formula: col.formula,
      ast,
      formulaError,
    };
  });

  const all = [...base, ...computed];
  if (!layout.order.length) return all;

  const byId = new Map(all.map((col) => [col.id, col]));
  const ordered = [];
  for (const id of layout.order) {
    if (byId.has(id)) {
      ordered.push(byId.get(id));
      byId.delete(id);
    }
  }
  for (const col of all) {
    if (byId.has(col.id)) ordered.push(col);
  }
  return ordered;
}
