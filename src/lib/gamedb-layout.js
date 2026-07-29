// Helpers shared by the table panels: layout shape, cell formatting and the
// display-column list that mixes SQL result columns with computed columns.
import { parseFormula } from "@/lib/gamedb-formula";
import { daysUntil, toDate, toNumber } from "@/lib/gamedb-values";

// Re-exported because half the app already imports them from here.
export { daysUntil, toDate, toNumber };

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
  merge: null,
  drill: null,
  group: null,
  folder: "",
  actions: [],
  refreshSeconds: 0,
  formats: {},
  freeze: 0,
};

export const ACTION_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export const PARAM_TYPES = ["text", "number", "date", "datetime", "select"];

// Ops are grouped by what they read: numbers, text, or a date compared with
// today. `value` may also be "[Another column]", which is resolved per row.
export const RULE_OPS = [
  ">",
  ">=",
  "<",
  "<=",
  "=",
  "!=",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "in",
  "empty",
  "notEmpty",
  "overdue",
  "dueIn",
  "isToday",
];

export const RULE_OP_LABELS = {
  ">": "มากกว่า",
  ">=": "มากกว่าหรือเท่ากับ",
  "<": "น้อยกว่า",
  "<=": "น้อยกว่าหรือเท่ากับ",
  "=": "เท่ากับ",
  "!=": "ไม่เท่ากับ",
  contains: "มีคำว่า",
  notContains: "ไม่มีคำว่า",
  startsWith: "ขึ้นต้นด้วย",
  endsWith: "ลงท้ายด้วย",
  in: "อยู่ในรายการ (คั่นด้วย ,)",
  empty: "ว่าง",
  notEmpty: "ไม่ว่าง",
  overdue: "เลยกำหนดแล้ว (วันที่)",
  dueIn: "ครบกำหนดภายใน N วัน",
  isToday: "เป็นวันนี้",
};

/** Ops that ignore `value` entirely, so the UI can hide the input. */
export const VALUELESS_OPS = ["empty", "notEmpty", "overdue", "isToday"];

// One palette for everything coloured: conditional rules, fixed column tints
// and header bands. Hex rather than Tailwind classes because the same tone has
// to work in an inline style on a sticky cell, and because a class name built
// at runtime is not in the stylesheet Tailwind generates.
export const CELL_TONES = {
  red: { bg: "#fee2e2", fg: "#b91c1c", head: "#fca5a5" },
  orange: { bg: "#ffedd5", fg: "#c2410c", head: "#fdba74" },
  amber: { bg: "#fef3c7", fg: "#b45309", head: "#fcd34d" },
  yellow: { bg: "#fef9c3", fg: "#854d0e", head: "#fde047" },
  lime: { bg: "#ecfccb", fg: "#4d7c0f", head: "#bef264" },
  green: { bg: "#dcfce7", fg: "#15803d", head: "#86efac" },
  teal: { bg: "#ccfbf1", fg: "#0f766e", head: "#5eead4" },
  sky: { bg: "#e0f2fe", fg: "#0369a1", head: "#7dd3fc" },
  blue: { bg: "#dbeafe", fg: "#1d4ed8", head: "#93c5fd" },
  violet: { bg: "#ede9fe", fg: "#6d28d9", head: "#c4b5fd" },
  pink: { bg: "#fce7f3", fg: "#be185d", head: "#f9a8d4" },
  zinc: { bg: "#f4f4f5", fg: "#3f3f46", head: "#d4d4d8" },
  redSolid: { bg: "#dc2626", fg: "#ffffff", head: "#b91c1c", headFg: "#ffffff" },
  greenSolid: { bg: "#16a34a", fg: "#ffffff", head: "#15803d", headFg: "#ffffff" },
  yellowSolid: { bg: "#facc15", fg: "#422006", head: "#eab308", headFg: "#422006" },
  darkSolid: { bg: "#27272a", fg: "#ffffff", head: "#18181b", headFg: "#ffffff" },
};

export const TONE_NAMES = Object.keys(CELL_TONES);
// "bar" is not a colour — it draws a proportional fill behind the number.
export const RULE_TONES = [...TONE_NAMES, "bar"];
export const CELL_RENDERS = ["text", "link", "email", "chip", "copy"];
// What a computed column's result is shown and exported as.
export const COMPUTED_TYPES = ["number", "text", "date", "boolean"];
// The box the "add a row" form shows for a column.
export const INPUT_WIDGETS = [
  "text",
  "number",
  "date",
  "time",
  "datetime",
  "select",
  "textarea",
  "checkbox",
];
export const CELL_ALIGNS = ["", "left", "center", "right"];
export const MAX_FREEZE = 5;
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
          // Editing a cell was the only thing this config could do, so a query
          // saved before now can do only that.
          allowInsert: layout.editable.allowInsert === true,
          allowDelete: layout.editable.allowDelete === true,
          inputs: normalizeInputs(layout.editable.inputs),
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
  const merge = normalizeMerge(layout.merge);
  const drill = normalizeDrill(layout.drill);

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
            // A rule saved before row scope existed only ever painted its cell.
            scope: rule.scope === "row" && rule.tone !== "bar" ? "row" : "cell",
          }))
      : [],
    summary,
    chart,
    sort,
    merge,
    drill,
    group:
      layout.group && typeof layout.group === "object" && layout.group.colId
        ? { colId: String(layout.group.colId) }
        : null,
    folder: typeof layout.folder === "string" ? layout.folder.trim().slice(0, 100) : "",
    actions: normalizeActions(layout.actions),
    refreshSeconds: REFRESH_CHOICES.includes(Number(layout.refreshSeconds))
      ? Number(layout.refreshSeconds)
      : 0,
    formats: normalizeFormats(layout.formats),
    freeze: normalizeFreeze(layout.freeze),
  };
}

// formats = { [colId]: { bg, fg, headerBg, render, wrap, align } } — how a
// column looks regardless of its value, as opposed to `rules`, which react to
// one. An entry with nothing set is dropped so the JSON stays small.
export const EMPTY_FORMAT = {
  bg: "",
  fg: "",
  headerBg: "",
  render: "text",
  wrap: false,
  align: "",
};

export function normalizeFormat(raw) {
  const format = raw && typeof raw === "object" ? raw : {};
  return {
    bg: TONE_NAMES.includes(format.bg) ? format.bg : "",
    fg: TONE_NAMES.includes(format.fg) ? format.fg : "",
    headerBg: TONE_NAMES.includes(format.headerBg) ? format.headerBg : "",
    render: CELL_RENDERS.includes(format.render) ? format.render : "text",
    wrap: format.wrap === true,
    align: CELL_ALIGNS.includes(format.align) ? format.align : "",
  };
}

export function isEmptyFormat(format) {
  return (
    !format.bg &&
    !format.fg &&
    !format.headerBg &&
    format.render === "text" &&
    !format.wrap &&
    !format.align
  );
}

export function normalizeFormats(raw) {
  if (!raw || typeof raw !== "object") return {};
  const formats = {};
  for (const [key, value] of Object.entries(raw)) {
    const format = normalizeFormat(value);
    if (!isEmptyFormat(format)) formats[String(key)] = format;
  }
  return formats;
}

// inputs = [{ column, widget, options, defaultValue, required }] — what the
// "add a row" form puts on screen for each writable column. An array, not a map
// keyed by column, so the order the form asks in is the order chosen here.
export function normalizeInputs(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .filter((input) => input && typeof input.column === "string" && input.column)
    .filter((input) => {
      if (seen.has(input.column)) return false;
      seen.add(input.column);
      return true;
    })
    .slice(0, 60)
    .map((input) => ({
      column: input.column,
      widget: INPUT_WIDGETS.includes(input.widget) ? input.widget : "text",
      options: Array.isArray(input.options)
        ? input.options.map(String).slice(0, 200)
        : [],
      defaultValue: input.defaultValue == null ? "" : String(input.defaultValue).slice(0, 200),
      required: input.required === true,
    }));
}

/** Turns "@today"/"@now" into what they mean at the moment the form opens. */
export function resolveInputDefault(defaultValue) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (defaultValue === "@today") return date;
  if (defaultValue === "@now") return `${date}T${time}`;
  if (defaultValue === "@time") return time;
  return defaultValue;
}

export function normalizeFreeze(raw) {
  // Number([4]) is 4 and Number({}) is NaN; neither is a count of columns, so
  // only an actual number or a numeric string counts.
  if (typeof raw !== "number" && typeof raw !== "string") return 0;
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.min(MAX_FREEZE, Math.max(0, Math.trunc(num)));
}

export function formatOf(layout, colId) {
  return layout.formats?.[colId] || EMPTY_FORMAT;
}

// actions = [{ label, method, url, bodyTemplate, confirm }] — a button per row
// that calls another service with {column} placeholders filled from that row.
// The host still has to be allow-listed server side.
export function normalizeActions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((action) => action && action.label && action.url)
    .slice(0, 6)
    .map((action) => ({
      label: String(action.label).slice(0, 60),
      method: ACTION_METHODS.includes(action.method) ? action.method : "POST",
      url: String(action.url).slice(0, 500),
      bodyTemplate: String(action.bodyTemplate || "").slice(0, 2000),
      confirm: action.confirm === false ? false : true,
    }));
}

// drill = { queryId, map: [{ column, param }] } — clicking a row opens another
// query with values from that row filled into its :parameters.
export function normalizeDrill(raw) {
  if (!raw || typeof raw !== "object") return null;
  const queryId = Number(raw.queryId);
  const map = Array.isArray(raw.map)
    ? raw.map
        .filter((item) => item && item.column && item.param)
        .slice(0, 10)
        .map((item) => ({ column: String(item.column), param: String(item.param) }))
    : [];
  if (!Number.isFinite(queryId) || map.length === 0) return null;
  return { queryId, map };
}

// merge = { queryId, on: [{left, right}], columns: [name], compare: [{left, right}] }
// "on" are the columns whose values must match; "columns" are pulled in from the
// other query; "compare" pairs are rendered as an equal/not-equal check.
export function normalizeMerge(raw) {
  if (!raw || typeof raw !== "object") return null;
  const queryId = Number(raw.queryId);
  const pairs = (value) =>
    Array.isArray(value)
      ? value
          .filter((pair) => pair && pair.left && pair.right)
          .slice(0, 10)
          .map((pair) => ({ left: String(pair.left), right: String(pair.right) }))
      : [];
  const on = pairs(raw.on);
  if (!Number.isFinite(queryId) || on.length === 0) return null;
  return {
    queryId,
    on,
    columns: Array.isArray(raw.columns) ? raw.columns.map(String).slice(0, 40) : [],
    compare: pairs(raw.compare),
  };
}

// Plain decimal digits only, and short enough to survive the trip through a
// double. `Number()` is far too generous to decide whether two cells are the
// same row: it reads " " as 0, "0x10" as 16 and "1e3" as 1000, and it rounds
// 9007199254740993 — a perfectly ordinary bigint id — down to its neighbour.
// Anything it cannot represent exactly is compared as text instead.
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function joinNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!DECIMAL.test(text)) return null;
  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  if (Number.isInteger(num) && !Number.isSafeInteger(num)) return null;
  return num;
}

/** Loose equality for joining: numbers by value, text trimmed and case-folded. */
export function cellsEqual(a, b) {
  const left = joinNumber(a);
  const right = joinNumber(b);
  if (left !== null && right !== null) return left === right;
  return (
    String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase()
  );
}

// A control character no real data contains, so the key for ["a", "b"]
// cannot collide with the key for ["ab"].
const MERGE_KEY_SEPARATOR = "\u0001";

/** Join key built the same way on both sides, so "10" matches 10. */
export function mergeKeyOf(values) {
  return values
    .map((value) => {
      const num = joinNumber(value);
      return num !== null ? `n:${num}` : `s:${String(value ?? "").trim().toLowerCase()}`;
    })
    .join(MERGE_KEY_SEPARATOR);
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
  // reduce, not Math.min(...numbers): spreading a long column is a call with
  // one argument per row, and enough rows overflow the stack.
  if (kind === "min") return numbers.reduce((low, num) => (num < low ? num : low));
  if (kind === "max") return numbers.reduce((high, num) => (num > high ? num : high));
  return null;
}

export const SUMMARY_LABELS = {
  sum: "รวม",
  avg: "เฉลี่ย",
  min: "ต่ำสุด",
  max: "สูงสุด",
  count: "นับ",
};

export const TONE_LABELS = {
  red: "แดงอ่อน",
  orange: "ส้ม",
  amber: "เหลืองส้ม",
  yellow: "เหลือง",
  lime: "เขียวอ่อน",
  green: "เขียว",
  teal: "เขียวน้ำทะเล",
  sky: "ฟ้า",
  blue: "น้ำเงิน",
  violet: "ม่วง",
  pink: "ชมพู",
  zinc: "เทา",
  redSolid: "แดงเข้ม (ทึบ)",
  greenSolid: "เขียวเข้ม (ทึบ)",
  yellowSolid: "เหลืองเข้ม (ทึบ)",
  darkSolid: "ดำ (ทึบ)",
  bar: "แถบวัดระดับ",
};

/** Inline style for a tone, or null for "no tone"/the bar pseudo-tone. */
export function toneStyle(tone, part = "cell") {
  const entry = CELL_TONES[tone];
  if (!entry) return null;
  if (part === "head") return { backgroundColor: entry.head, color: entry.headFg || "#27272a" };
  return { backgroundColor: entry.bg, color: entry.fg };
}

const COLUMN_REF = /^\[(.+)\]$/;

/**
 * @param resolve optional (name) => raw value of another column in the same
 *   row, which is what lets a rule read "[ยอดออก]" instead of a fixed number.
 */
export function ruleMatches(rule, raw, text, resolve) {
  const cellText = String(text ?? "");
  const trimmed = cellText.trim();

  if (rule.op === "empty") return trimmed === "" || trimmed === "—";
  if (rule.op === "notEmpty") return trimmed !== "" && trimmed !== "—";

  if (rule.op === "overdue") {
    const days = daysUntil(raw);
    return days !== null && days < 0;
  }
  if (rule.op === "isToday") return daysUntil(raw) === 0;
  if (rule.op === "dueIn") {
    const days = daysUntil(raw);
    const limit = toNumber(rule.value);
    if (days === null || limit === null) return false;
    return days >= 0 && days <= limit;
  }

  // Resolve "[Other column]" once, so every op below compares against whatever
  // it produced instead of the literal text.
  let compare = String(rule.value ?? "");
  const ref = COLUMN_REF.exec(compare.trim());
  if (ref) {
    if (!resolve) return false;
    const other = resolve(ref[1].trim());
    if (other === undefined) return false;
    compare = other === null ? "" : String(other);
  }
  const lowerCompare = compare.toLowerCase();
  const lowerText = cellText.toLowerCase();

  switch (rule.op) {
    case "contains":
      return lowerText.includes(lowerCompare);
    case "notContains":
      return !lowerText.includes(lowerCompare);
    case "startsWith":
      return lowerText.trimStart().startsWith(lowerCompare);
    case "endsWith":
      return lowerText.trimEnd().endsWith(lowerCompare);
    case "in":
      return compare
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .includes(trimmed.toLowerCase());
    default:
      break;
  }

  const left = toNumber(raw);
  const right = toNumber(compare);
  if (left === null || right === null) {
    // Dates compare in order even though neither side is a number.
    const leftDate = toDate(raw);
    const rightDate = toDate(compare);
    if (leftDate && rightDate) {
      return compareNumbers(rule.op, leftDate.getTime(), rightDate.getTime());
    }
    if (rule.op === "=") return trimmed === compare.trim();
    if (rule.op === "!=") return trimmed !== compare.trim();
    return false;
  }
  return compareNumbers(rule.op, left, right);
}

function compareNumbers(op, left, right) {
  switch (op) {
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
    // \r counts: the file itself is CRLF-separated, so a bare carriage return
    // inside a value splits the row unless it is quoted.
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return `﻿${lines.join("\r\n")}`;
}

// Display columns mix base result columns (id = name), computed columns
// (id = "#key") and anything merged in from another query (id = "~name" or
// "?left|right"), so layout order/hidden/labels/widths address them all the
// same way.
/**
 * The display id of each result column, in order.
 *
 * Two result columns can carry the same name — `SELECT o.id, c.id`, or a join
 * of two tables that both have "created_at", is ordinary SQL. Addressing them
 * by name alone made the second one resolve to the first one's value, so the
 * repeat gets a suffix. The first keeps the plain name, which is what lets a
 * layout saved before this keep matching.
 */
export function baseColumnIds(resultColumns) {
  const seen = new Map();
  return resultColumns.map((col) => {
    const occurrence = (seen.get(col.name) || 0) + 1;
    seen.set(col.name, occurrence);
    return occurrence === 1 ? col.name : `${col.name}#${occurrence}`;
  });
}

export function buildDisplayColumns(resultColumns, layout, mergedColumns = []) {
  const ids = baseColumnIds(resultColumns);
  // `index` is what the row lookup uses — never the name.
  const base = resultColumns.map((col, index) => ({
    id: ids[index],
    index,
    label: layout.labels[ids[index]] || (ids[index] === col.name ? col.name : `${col.name} (${ids[index].split("#").pop()})`),
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
      // Formulas could only produce numbers before there was a type to store.
      type: COMPUTED_TYPES.includes(col.type) ? col.type : "number",
      kind: "computed",
      formula: col.formula,
      ast,
      formulaError,
    };
  });

  const all = [
    ...base,
    ...computed,
    ...mergedColumns.map((col) => ({
      ...col,
      label: layout.labels[col.id] || col.label,
    })),
  ];
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
