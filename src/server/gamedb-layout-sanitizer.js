// Server-side validation for a query's layout JSON. Shared by the layout
// endpoint and by saved screen templates, which embed layouts of their own.
import {
  COMPUTED_TYPES,
  normalizeColumnMap,
  normalizeDrill,
  normalizeFormats,
  normalizeFreeze,
  normalizeInputs,
  normalizeInsertForm,
  normalizeMerge,
  PARAM_TYPES,
  REFRESH_CHOICES,
  RULE_OPS,
  RULE_TONES,
  SUMMARY_KINDS,
} from "@/lib/gamedb-layout";
import { isSafeIdentifier, isSafeIdentifierPart } from "@/lib/gamedb-identifier";

function sanitizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, 200)
    : [];
}

// Shared with the gameinfo module: a game's computed_column JSONB column
// holds the same shape, so both surfaces can edit it with this one sanitizer.
export function sanitizeComputedColumns(raw) {
  return Array.isArray(raw)
    ? raw
        .filter(
          (col) =>
            col &&
            typeof col.key === "string" &&
            typeof col.label === "string" &&
            typeof col.formula === "string"
        )
        .slice(0, 30)
        .map((col) => ({
          key: col.key.slice(0, 64),
          label: col.label.slice(0, 120),
          formula: col.formula.slice(0, 500),
          // Absent on every column saved before formulas could return text.
          type: COMPUTED_TYPES.includes(col.type) ? col.type : "number",
        }))
    : [];
}

// Layout shape: { order, hidden, labels, widths, computed, params, editable,
// rules, summary, chart, sort, refreshSeconds }. Everything here is display
// configuration a signed-in user may change, except `editable`, which decides
// which table rows the edit endpoint will write to and is therefore checked
// again — and restricted to admins — over there.
export function sanitizeLayout(raw) {
  const layout = raw && typeof raw === "object" ? raw : {};
  const labels = {};
  const widths = {};
  const summary = {};
  if (layout.widths && typeof layout.widths === "object") {
    for (const [key, value] of Object.entries(layout.widths).slice(0, 200)) {
      const num = Number(value);
      if (typeof key === "string" && Number.isFinite(num) && num > 0) {
        widths[key.slice(0, 200)] = Math.round(Math.min(900, Math.max(40, num)));
      }
    }
  }
  if (layout.labels && typeof layout.labels === "object") {
    for (const [key, label] of Object.entries(layout.labels)) {
      if (typeof label === "string" && label.trim()) {
        labels[key] = label.trim().slice(0, 120);
      }
    }
  }
  if (layout.summary && typeof layout.summary === "object") {
    for (const [key, kind] of Object.entries(layout.summary).slice(0, 200)) {
      if (SUMMARY_KINDS.includes(kind)) summary[String(key).slice(0, 200)] = kind;
    }
  }
  const computed = sanitizeComputedColumns(layout.computed);
  const params = Array.isArray(layout.params)
    ? layout.params
        .filter((param) => param && /^[A-Za-z_][A-Za-z0-9_]*$/.test(param.name || ""))
        .slice(0, 20)
        .map((param) => ({
          name: String(param.name),
          label: String(param.label || param.name).slice(0, 120),
          type: PARAM_TYPES.includes(param.type) ? param.type : "text",
          defaultValue: String(param.defaultValue ?? "").slice(0, 200),
          options: sanitizeStringArray(param.options)
            .slice(0, 100)
            .map((option) => option.slice(0, 200)),
          required: param.required !== false,
        }))
    : [];
  const rules = Array.isArray(layout.rules)
    ? layout.rules
        .filter(
          (rule) =>
            rule &&
            typeof rule.colId === "string" &&
            RULE_OPS.includes(rule.op) &&
            RULE_TONES.includes(rule.tone)
        )
        .slice(0, 40)
        .map((rule) => ({
          colId: rule.colId.slice(0, 200),
          op: rule.op,
          value: String(rule.value ?? "").slice(0, 120),
          tone: rule.tone,
          scope: rule.scope === "row" && rule.tone !== "bar" ? "row" : "cell",
        }))
    : [];
  // A result column is a label — "VPN / NO VPN" is a perfectly good one — and
  // never reaches SQL. What has to survive quoting is the table column it maps
  // to, which is the alias itself only when no mapping was given.
  const rawEditable =
    layout.editable && typeof layout.editable === "object" ? layout.editable : null;
  const columnMap = normalizeColumnMap(rawEditable?.columnMap);
  const editableColumns = rawEditable
    ? sanitizeStringArray(rawEditable.columns)
        .slice(0, 50)
        .filter((name) => isSafeIdentifierPart(columnMap[name] || name))
    : [];
  const pkResult = String(rawEditable?.pk || "");
  const pkColumn = String(rawEditable?.pkColumn || "").trim();
  const editable =
    rawEditable &&
    isSafeIdentifier(String(rawEditable.table || "")) &&
    pkResult &&
    isSafeIdentifierPart(pkColumn || pkResult)
      ? {
          table: String(rawEditable.table),
          pk: pkResult,
          pkColumn,
          columns: editableColumns,
          // A mapping for a column that is not writable is dead weight.
          columnMap: Object.fromEntries(
            Object.entries(columnMap).filter(([name]) => editableColumns.includes(name))
          ),
          allowInsert: rawEditable.allowInsert === true,
          allowDelete: rawEditable.allowDelete === true,
          // A form field for a column that is not writable would be a box that
          // silently does nothing, so those are dropped here rather than
          // ignored later.
          inputs: normalizeInputs(rawEditable.inputs)
            .filter((input) => editableColumns.includes(input.column))
            // A lookup names a table and two of its columns, and those are
            // quoted into a SELECT later, so an unusable one is dropped here
            // and the field falls back to a plain box.
            .map((input) =>
              input.lookup &&
              isSafeIdentifier(input.lookup.table) &&
              isSafeIdentifierPart(input.lookup.valueColumn) &&
              isSafeIdentifierPart(input.lookup.labelColumn)
                ? input
                : { ...input, lookup: null, widget: input.widget === "lookup" ? "text" : input.widget }
            ),
        }
      : null;
  const chart =
    layout.chart && typeof layout.chart === "object" && layout.chart.x
      ? {
          type: layout.chart.type === "line" ? "line" : "bar",
          x: String(layout.chart.x).slice(0, 200),
          y: sanitizeStringArray(layout.chart.y).slice(0, 6),
        }
      : null;
  const sort =
    layout.sort && typeof layout.sort === "object" && layout.sort.colId
      ? {
          colId: String(layout.sort.colId).slice(0, 200),
          dir: layout.sort.dir === "desc" ? "desc" : "asc",
        }
      : null;
  // Merge and drill only name another saved query and its columns; the join
  // and the navigation happen in the browser, so nothing here reaches SQL.
  const merge = normalizeMerge(layout.merge);
  const drill = normalizeDrill(layout.drill);
  const group =
    layout.group && typeof layout.group === "object" && layout.group.colId
      ? { colId: String(layout.group.colId).slice(0, 200) }
      : null;
  const folder =
    typeof layout.folder === "string" ? layout.folder.trim().slice(0, 100) : "";

  return {
    order: sanitizeStringArray(layout.order),
    hidden: sanitizeStringArray(layout.hidden),
    labels,
    widths,
    computed,
    params,
    editable,
    // Stored as written: what makes it safe is the check at run time, not a
    // rewrite here, and rewriting SQL would only make it wrong quietly.
    insertForm: normalizeInsertForm(layout.insertForm),
    rules,
    summary,
    chart,
    sort,
    merge,
    drill,
    group,
    folder,
    refreshSeconds: REFRESH_CHOICES.includes(Number(layout.refreshSeconds))
      ? Number(layout.refreshSeconds)
      : 0,
    // Formats and freeze are display-only: every value is checked against a
    // fixed list of tone/render names, so nothing here reaches the DOM as CSS
    // or SQL text.
    formats: capEntries(normalizeFormats(layout.formats), 200),
    freeze: normalizeFreeze(layout.freeze),
  };
}

function capEntries(object, limit) {
  const entries = Object.entries(object).slice(0, limit);
  const capped = {};
  for (const [key, value] of entries) capped[key.slice(0, 200)] = value;
  return capped;
}
