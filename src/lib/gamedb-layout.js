// Helpers shared by the table panels: layout shape, cell formatting and the
// display-column list that mixes SQL result columns with computed columns.
import { parseFormula } from "@/lib/gamedb-formula";

export const EMPTY_LAYOUT = {
  order: [],
  hidden: [],
  labels: {},
  computed: [],
  widths: {},
};

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
  return {
    order: Array.isArray(layout.order) ? layout.order : [],
    hidden: Array.isArray(layout.hidden) ? layout.hidden : [],
    labels:
      layout.labels && typeof layout.labels === "object" ? layout.labels : {},
    computed: Array.isArray(layout.computed) ? layout.computed : [],
    widths,
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
