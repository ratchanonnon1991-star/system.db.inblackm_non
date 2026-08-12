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
  insertForm: null,
  rules: [],
  summary: {},
  chart: null,
  sort: null,
  merge: null,
  lookups: [],
  drill: null,
  group: null,
  folder: "",
  refreshSeconds: 0,
  formats: {},
  freeze: 0,
  tableTone: "",
  tableBorderTone: "",
};

export const PARAM_TYPES = [
  "text",
  "number",
  "date",
  "datetime",
  "time",
  "boolean",
  "select",
];

export const MAX_INSERT_SQL = 5000;
export const MAX_INSERT_FIELDS = 50;

/**
 * The saved "add data" form: one INSERT written by an admin, plus a label and a
 * type for each :placeholder in it.
 *
 * The SQL is stored as written. It is never assembled from what a filler types —
 * their values are bound as parameters — and it is checked against the INSERT
 * rules on the server every time it runs rather than once when it is saved, so
 * a script edited into the JSONB by hand is no better off than one typed here.
 */
export function normalizeInsertForm(raw) {
  if (!raw || typeof raw !== "object") return null;
  const sql = String(raw.sql || "").trim();
  if (!sql) return null;
  return {
    sql: sql.slice(0, MAX_INSERT_SQL),
    label: String(raw.label || "").trim().slice(0, 60),
    fields: Array.isArray(raw.fields)
      ? raw.fields
          .filter((field) => field && typeof field.name === "string" && field.name)
          .slice(0, MAX_INSERT_FIELDS)
          .map((field) => ({
            name: field.name.slice(0, 64),
            label: String(field.label || field.name).slice(0, 120),
            type: PARAM_TYPES.includes(field.type) ? field.type : "text",
            defaultValue:
              field.defaultValue == null ? "" : String(field.defaultValue).slice(0, 500),
            options: Array.isArray(field.options) ? field.options.map(String).slice(0, 100) : [],
            required: field.required !== false,
          }))
      : [],
  };
}

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
// `fg` is the ink that sits ON `bg`, which is not the same thing as the colour
// the tone is named for. A solid tone's ink is white, so using `fg` when the
// tone is picked as a text colour paints white text on a white cell — the
// setting appearing to do nothing at all. `ink` is what the tone looks like as
// text on the page's own background.
// `head` used to be each hue's 300-level step (red bg #fee2e2 next to a
// #fca5a5 header band) -- a two-step jump in one glance, since bg is the
// 100-level step. Stepped down to each hue's 200-level (still the same
// Tailwind scale these were already drawn from, not a new hand-picked hex)
// so a themed table reads as one coherent tint instead of a light cell
// under a noticeably more saturated header.
export const CELL_TONES = {
  red: { bg: "#fee2e2", fg: "#b91c1c", head: "#fecaca", ink: "#b91c1c" },
  orange: { bg: "#ffedd5", fg: "#c2410c", head: "#fed7aa", ink: "#c2410c" },
  amber: { bg: "#fef3c7", fg: "#b45309", head: "#fde68a", ink: "#b45309" },
  yellow: { bg: "#fef9c3", fg: "#854d0e", head: "#fef08a", ink: "#854d0e" },
  lime: { bg: "#ecfccb", fg: "#4d7c0f", head: "#d9f99d", ink: "#4d7c0f" },
  green: { bg: "#dcfce7", fg: "#15803d", head: "#bbf7d0", ink: "#15803d" },
  teal: { bg: "#ccfbf1", fg: "#0f766e", head: "#99f6e4", ink: "#0f766e" },
  sky: { bg: "#e0f2fe", fg: "#0369a1", head: "#bae6fd", ink: "#0369a1" },
  blue: { bg: "#dbeafe", fg: "#1d4ed8", head: "#bfdbfe", ink: "#1d4ed8" },
  violet: { bg: "#ede9fe", fg: "#6d28d9", head: "#ddd6fe", ink: "#6d28d9" },
  pink: { bg: "#fce7f3", fg: "#be185d", head: "#fbcfe8", ink: "#be185d" },
  zinc: { bg: "#f4f4f5", fg: "#3f3f46", head: "#e4e4e7", ink: "#3f3f46" },
  redSolid: { bg: "#dc2626", fg: "#ffffff", head: "#b91c1c", headFg: "#ffffff", ink: "#dc2626" },
  greenSolid: { bg: "#16a34a", fg: "#ffffff", head: "#15803d", headFg: "#ffffff", ink: "#15803d" },
  yellowSolid: { bg: "#facc15", fg: "#422006", head: "#eab308", headFg: "#422006", ink: "#a16207" },
  darkSolid: { bg: "#27272a", fg: "#ffffff", head: "#18181b", headFg: "#ffffff", ink: "#000000" },
};

export const TONE_NAMES = Object.keys(CELL_TONES);
// Whole-table themes stay in the readable pastel range. Solid tones remain
// available for individual cells and rules, where their stronger contrast is
// useful without turning an entire query panel into one saturated block.
export const TABLE_TONES = TONE_NAMES.filter((tone) => !tone.endsWith("Solid"));

// A tone no longer has to be one of the 16 named presets above -- a pick can
// also be a point on the hue wheel, encoded as "hue:210" (pastel, same
// bg/head/fg weight as the presets) or "hueSolid:210" (the presets' *Solid
// tones, generalized to any hue instead of only red/green/yellow/dark).
// Encoded as a string (not an object) so it slots into the exact same
// format.bg/rule.tone/etc string fields the 16 presets already used, and old
// saved layouts that reference a preset by name keep meaning what they meant.
const HUE_TOKEN = /^hue(Solid)?:(-?\d+(?:\.\d+)?)$/;

export function isHueToken(tone) {
  return typeof tone === "string" && HUE_TOKEN.test(tone);
}

export function hueTokenOf(hue, solid = false) {
  const h = ((Math.round(Number(hue) || 0) % 360) + 360) % 360;
  return `${solid ? "hueSolid" : "hue"}:${h}`;
}

/** A tone value worth keeping: one of the named presets, or a hue token.
 * `named` narrows to a specific preset list (TONE_NAMES, TABLE_TONES,
 * RULE_TONES) -- a hue token always passes regardless of which list, since
 * the wheel has no "not in this list" concept the way named presets do.
 * Exported so the server-side sanitizer validates saved layouts against the
 * exact same rule instead of a second copy of it. */
// The hue wheel can't reach true black/white/grey (it's saturation-only), and
// dragging a slider to an exact brand colour is fiddly -- so a pick can also
// be a literal hex colour from the browser's own colour dialog, encoded as
// "rgb:#rrggbb". Same reasoning as the hue token: a string, so it slots into
// the same fields, and old layouts that never saw one are unaffected.
const RGB_TOKEN = /^rgb:(#[0-9a-fA-F]{6})$/;

export function isRgbToken(tone) {
  return typeof tone === "string" && RGB_TOKEN.test(tone);
}

export function rgbTokenOf(hex) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || "").trim());
  return match ? `rgb:#${match[1].toLowerCase()}` : "";
}

export function isCustomTone(tone) {
  return isHueToken(tone) || isRgbToken(tone);
}

export function isValidTone(tone, named) {
  return named.includes(tone) || isCustomTone(tone);
}

/** The same {bg, fg, head, ink[, headFg]} shape CELL_TONES entries have,
 * generated from a hue instead of looked up -- kept at the same lightness
 * bands the presets use (pastel bg/head a step apart, a solid variant for
 * strong contrast) so a picked hue looks like it belongs next to them. */
function hueToTone(hue, solid) {
  const h = ((Math.round(Number(hue) || 0) % 360) + 360) % 360;
  if (solid) {
    return {
      bg: `hsl(${h} 72% 45%)`,
      fg: "#ffffff",
      head: `hsl(${h} 72% 37%)`,
      headFg: "#ffffff",
      ink: `hsl(${h} 65% 36%)`,
    };
  }
  return {
    bg: `hsl(${h} 80% 92%)`,
    fg: `hsl(${h} 55% 32%)`,
    head: `hsl(${h} 70% 84%)`,
    ink: `hsl(${h} 55% 32%)`,
  };
}

// Perceived brightness (ITU-R BT.601) decides whether text on this exact
// colour reads better in white or near-black -- same trick browsers use for
// their own colour-input contrast, cheap enough to run on every render.
function rgbToTone(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const bright = (r * 299 + g * 587 + b * 114) / 1000;
  const light = bright > 150;
  const fg = light ? "#18181b" : "#ffffff";
  return { bg: hex, fg, head: hex, headFg: fg, ink: light ? "#18181b" : hex };
}

function toneEntry(tone) {
  if (CELL_TONES[tone]) return CELL_TONES[tone];
  const hueMatch = HUE_TOKEN.exec(tone);
  if (hueMatch) return hueToTone(hueMatch[2], Boolean(hueMatch[1]));
  const rgbMatch = RGB_TOKEN.exec(tone);
  return rgbMatch ? rgbToTone(rgbMatch[1]) : null;
}
// "bar" is not a colour — it draws a proportional fill behind the number.
export const RULE_TONES = [...TONE_NAMES, "bar"];
export const CELL_RENDERS = ["text", "link", "email", "chip", "copy"];
// What a computed column's result is shown and exported as.
export const COMPUTED_TYPES = ["number", "text", "date", "boolean", "tutorial", "image"];
// The box the "add a row" form shows for a column.
export const INPUT_WIDGETS = [
  "text",
  "number",
  "date",
  "time",
  "datetime",
  "select",
  "lookup",
  "textarea",
  "checkbox",
];
// How many rows a lookup dropdown will read. Past this it stops being a
// dropdown and wants a search box, which is a different feature.
export const LOOKUP_LIMIT = 500;
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
          // `pk` and `columns` name columns in the *result*, which is what the
          // panel reads values out of. A SELECT that aliases them — and any
          // readable query does — needs the real names too, or the WHERE and
          // the SET would be written against labels the table has never heard
          // of. Blank means the alias is the column name, which is how every
          // config saved before this behaved.
          pkColumn: String(layout.editable.pkColumn || "").trim(),
          columnMap: normalizeColumnMap(layout.editable.columnMap),
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
  const lookups = lookupsFromLayout(layout);
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
            required: param.required !== false,
          }))
      : [],
    editable,
    insertForm: normalizeInsertForm(layout.insertForm),
    rules: Array.isArray(layout.rules)
      ? layout.rules
          .filter(
            (rule) =>
              rule &&
              typeof rule.colId === "string" &&
              RULE_OPS.includes(rule.op) &&
              isValidTone(rule.tone, RULE_TONES)
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
    lookups,
    drill,
    group:
      layout.group && typeof layout.group === "object" && layout.group.colId
        ? { colId: String(layout.group.colId) }
        : null,
    folder: typeof layout.folder === "string" ? layout.folder.trim().slice(0, 100) : "",
    refreshSeconds: REFRESH_CHOICES.includes(Number(layout.refreshSeconds))
      ? Number(layout.refreshSeconds)
      : 0,
    formats: normalizeFormats(layout.formats),
    freeze: normalizeFreeze(layout.freeze),
    tableTone: isValidTone(layout.tableTone, TABLE_TONES) ? layout.tableTone : "",
    tableBorderTone: isValidTone(layout.tableBorderTone, TABLE_TONES)
      ? layout.tableBorderTone
      : "",
  };
}

// formats = { [colId]: { bg, fg, headerBg, headerFg, render, wrap, align } } — how a
// column looks regardless of its value, as opposed to `rules`, which react to
// one. An entry with nothing set is dropped so the JSON stays small.
export const EMPTY_FORMAT = {
  bg: "",
  fg: "",
  headerBg: "",
  headerFg: "",
  render: "text",
  wrap: false,
  align: "",
  group: "",
  groupBg: "",
};

export const MAX_GROUP_LABEL = 60;

export function normalizeFormat(raw) {
  const format = raw && typeof raw === "object" ? raw : {};
  return {
    bg: isValidTone(format.bg, TONE_NAMES) ? format.bg : "",
    fg: isValidTone(format.fg, TONE_NAMES) ? format.fg : "",
    headerBg: isValidTone(format.headerBg, TONE_NAMES) ? format.headerBg : "",
    headerFg: isValidTone(format.headerFg, TONE_NAMES) ? format.headerFg : "",
    render: CELL_RENDERS.includes(format.render) ? format.render : "text",
    wrap: format.wrap === true,
    align: CELL_ALIGNS.includes(format.align) ? format.align : "",
    // The band above the header. Columns sharing a label and sitting next to
    // each other are drawn as one cell spanning them.
    group: typeof format.group === "string" ? format.group.trim().slice(0, MAX_GROUP_LABEL) : "",
    groupBg: isValidTone(format.groupBg, TONE_NAMES) ? format.groupBg : "",
  };
}

export function isEmptyFormat(format) {
  return (
    !format.bg &&
    !format.fg &&
    !format.headerBg &&
    !format.headerFg &&
    format.render === "text" &&
    !format.wrap &&
    !format.align &&
    !format.group &&
    !format.groupBg
  );
}

/** Apply one group-header colour to every column that shares its group name. */
export function applyGroupTone(formats, colId, groupBg) {
  const group = String(formats?.[colId]?.group || "").trim();
  if (!group || (groupBg && !isValidTone(groupBg, TONE_NAMES))) return formats;
  return Object.fromEntries(
    Object.entries(formats).map(([id, format]) => [
      id,
      String(format.group || "").trim() === group ? { ...format, groupBg } : format,
    ])
  );
}

/**
 * The header band as runs of neighbouring columns that share a label.
 *
 * A group whose columns are not next to each other — after a reorder, say —
 * becomes two bands with the same label rather than one band swallowing the
 * columns in between, which would be a lie about what is underneath it.
 */
export function buildHeaderGroups(columns, layout) {
  const runs = [];
  for (const col of columns) {
    const format = formatOf(layout, col.id);
    const last = runs[runs.length - 1];
    const groupTone = format.groupBg || layout.tableTone || "";
    if (last && last.label === format.group && last.tone === groupTone) {
      last.span += 1;
    } else {
      runs.push({ label: format.group, tone: groupTone, span: 1 });
    }
  }
  return runs;
}

export function hasHeaderGroups(columns, layout) {
  return columns.some((col) => formatOf(layout, col.id).group);
}

/**
 * The colour a cell ends up with: a matching rule first, then the column's own
 * tint. Shared so the table on screen and the exported workbook cannot drift.
 */
export function pickCellTone(rules, format, raw, text, resolve) {
  const rule = rules.find(
    (item) => item.tone !== "bar" && ruleMatches(item, raw, text, resolve)
  );
  return rule?.tone || format.bg || "";
}

/**
 * The tone of every cell in the table, for the workbook export.
 *
 * The table on screen only ever styles the rows it is showing; a download has
 * to answer for all of them, so this walks the lot in one pass.
 */
export function buildToneGrid(columns, rows, layout) {
  const perColumn = columns.map((col) => ({
    rules: layout.rules.filter((rule) => rule.colId === col.id && rule.scope !== "row"),
    format: formatOf(layout, col.id),
  }));
  const rowRules = layout.rules
    .filter((rule) => rule.scope === "row" && rule.tone !== "bar")
    .map((rule) => ({ rule, index: columns.findIndex((col) => col.id === rule.colId) }))
    .filter((entry) => entry.index !== -1);

  const indexByName = new Map();
  columns.forEach((col, index) => {
    indexByName.set(col.id, index);
    if (!indexByName.has(col.label)) indexByName.set(col.label, index);
  });

  return rows.map((row) => {
    const resolve = (name) => {
      const index = indexByName.get(name);
      return index === undefined ? undefined : row.cells[index]?.raw;
    };
    const rowRule = rowRules.find((entry) =>
      ruleMatches(entry.rule, row.cells[entry.index]?.raw, row.cells[entry.index]?.text, resolve)
    );
    return columns.map((col, index) => {
      const { rules, format } = perColumn[index];
      const cell = row.cells[index];
      // On screen a row tone is the background the cell sits on, so a cell with
      // nothing of its own shows it; here that has to be spelled out.
      return (
        pickCellTone(rules, format, cell?.raw, cell?.text, resolve) ||
        rowRule?.rule.tone ||
        layout.tableTone ||
        ""
      );
    });
  });
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
      lookup: normalizeLookup(input.lookup),
      defaultValue: input.defaultValue == null ? "" : String(input.defaultValue).slice(0, 200),
      required: input.required === true,
    }));
}

/**
 * The box a column gets when nobody configured one: whatever its own type says.
 * A boolean offers true and false rather than a text field you can type "yes"
 * into, and a number column takes numbers.
 */
export function widgetForColumn(column) {
  switch (column?.type) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    default:
      return "text";
  }
}

// lookup = { table, valueColumn, labelColumn } — the dropdown is the rows of
// another table. A joined column shows a name and stores an id, and this is how
// the form offers the names while writing the ids.
export function normalizeLookup(raw) {
  if (!raw || typeof raw !== "object") return null;
  const table = String(raw.table || "").trim();
  const valueColumn = String(raw.valueColumn || "").trim();
  const labelColumn = String(raw.labelColumn || "").trim();
  if (!table || !valueColumn || !labelColumn) return null;
  return {
    table: table.slice(0, 200),
    valueColumn: valueColumn.slice(0, 200),
    labelColumn: labelColumn.slice(0, 200),
  };
}

// columnMap = { [result column]: real table column }. Only the ones that differ
// are worth storing, so an identity entry is dropped.
export function normalizeColumnMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const map = {};
  for (const [result, column] of Object.entries(raw).slice(0, 60)) {
    const real = typeof column === "string" ? column.trim() : "";
    if (real && real !== result) map[String(result).slice(0, 200)] = real.slice(0, 200);
  }
  return map;
}

/** The table column a result column is written back to. */
export function realColumnOf(editable, resultName) {
  return editable?.columnMap?.[resultName] || resultName;
}

/** The table column the key lives in, which the result may have aliased. */
export function realPkOf(editable) {
  return editable?.pkColumn || editable?.pk || "";
}

/**
 * One entry of a dropdown, written "label = stored value".
 *
 * What a column shows and what it stores are often different — a CASE that
 * turns BOT_AUTO into "Bot Auto" is the whole reason these tables are readable
 * — and a dropdown that wrote its own label back would undo that. With no "="
 * the two are the same, which is the ordinary case.
 */
export function parseOption(text) {
  const raw = String(text ?? "");
  const split = raw.indexOf("=");
  if (split === -1) {
    const trimmed = raw.trim();
    return { label: trimmed, value: trimmed };
  }
  return { label: raw.slice(0, split).trim(), value: raw.slice(split + 1).trim() };
}

/**
 * The choice a cell is currently on.
 *
 * The cell holds whatever the SELECT produced, which for a joined column is the
 * label and for a plain one is the stored value, so both are worth matching.
 */
export function matchChoice(choices, value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return (
    choices.find((choice) => String(choice.value) === text) ||
    choices.find((choice) => String(choice.label).trim() === text) ||
    null
  );
}

/** The option whose label or stored value matches what the cell holds. */
export function matchOption(options, value) {
  return matchChoice(options.map(parseOption), value);
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

// A table only has time to actually run so many other queries on every
// refresh before it stops being "one panel" and starts being a batch job.
export const MAX_LOOKUPS = 3;

// lookups = [{ id, queryId, on, columns, compare }, ...] — `merge`, but more
// than one at a time. Each entry is shaped exactly like `merge`; `id` is only
// there so a panel can tell its lookups apart (which one a modal is editing,
// which one a delete button removes) and never reaches SQL or a column id.
//
// A layout saved before lookups existed has `merge` instead, so
// `normalizeLayout` and the sanitizer both wrap that single value into a
// one-item array here rather than making every caller check two fields.
export function normalizeLookups(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item, index) => {
      const merge = normalizeMerge(item);
      if (!merge) return null;
      const id =
        typeof item?.id === "string" && item.id.trim()
          ? item.id.trim().slice(0, 40)
          : `lk${index}`;
      return { id, ...merge };
    })
    .filter(Boolean)
    .slice(0, MAX_LOOKUPS);
}

export function lookupsFromLayout(layout) {
  if (!layout || typeof layout !== "object") return [];
  if (Array.isArray(layout.lookups) && layout.lookups.length) {
    return normalizeLookups(layout.lookups);
  }
  const legacy = normalizeMerge(layout.merge);
  return legacy ? [{ id: "legacy", ...legacy }] : [];
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
  if (type === "boolean") return value ? "Yes" : "No";
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

/**
 * What one cell ends up looking like, given its column's fixed format and the
 * conditional rule that fired on it (if any).
 *
 * This used to be four intertwined expressions inside the table component,
 * which is how a text colour came to be silently dropped whenever a background
 * was set and how a chip came to ignore it entirely. Out here the combinations
 * can be stated once and tested.
 *
 * - `cell` is the style for the <td>: null when a chip carries the colour.
 * - `chip` is the style for the pill drawn inside the cell, or null.
 * - A rule that has fired wins over the column's fixed colours: those are one
 *   person's choice in one dialog, a rule is the cell reacting to its own value.
 */
export function cellVisual(format, ruleTone = "") {
  const isChip = format.render === "chip";
  const background = ruleTone || format.bg;
  const ink = ruleTone ? "" : toneTextColor(format.fg);

  if (isChip) {
    const base = toneStyle(background) || { backgroundColor: "#f4f4f5", color: "#3f3f46" };
    return { cell: null, chip: ink ? { ...base, color: ink } : base, ink };
  }
  const fill = toneStyle(background);
  if (!fill && !ink) return { cell: null, chip: null, ink: "" };
  return {
    cell: { ...(fill || {}), ...(ink ? { color: ink } : {}) },
    chip: null,
    ink,
  };
}

/** A tone used as a text colour: what it looks like as ink, not as a fill. */
export function toneTextColor(tone) {
  return toneEntry(tone)?.ink || "";
}

/** Inline style for a tone, or null for "no tone"/the bar pseudo-tone. Covers
 * both a named preset and a hue token -- see toneEntry. */
export function toneStyle(tone, part = "cell") {
  const entry = toneEntry(tone);
  if (!entry) return null;
  if (part === "head") return { backgroundColor: entry.head, color: entry.headFg || "#27272a" };
  return { backgroundColor: entry.bg, color: entry.fg };
}

/** A short label for a tone picker/legend: the preset's Thai name, or a
 * generic label for a hue-token pick (which has no fixed name). */
export function toneLabel(tone) {
  if (TONE_LABELS[tone]) return TONE_LABELS[tone];
  return isCustomTone(tone) ? "สีที่เลือกเอง" : "";
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
