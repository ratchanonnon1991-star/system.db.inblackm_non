// Server-side validation for a query's layout JSON. Shared by the layout
// endpoint and by saved screen templates, which embed layouts of their own.
import {
  COMPUTED_TYPES,
  normalizeColumnMap,
  normalizeDrill,
  normalizeEditableTargets,
  normalizeFormats,
  normalizeFreeze,
  normalizeInputs,
  normalizeInsertForm,
  normalizeMerge,
  normalizeRowTargets,
  lookupsFromLayout,
  PARAM_TYPES,
  REFRESH_CHOICES,
  isValidTone,
  MAX_SORT_COLUMNS,
  RULE_OPS,
  RULE_TONES,
  SUMMARY_KINDS,
  TABLE_TONES,
} from "@/lib/gamedb-layout";
import { isSafeIdentifier, isSafeIdentifierPart } from "@/lib/gamedb-identifier";
import { GAMEINFO_MARKET_KEYS } from "@/lib/gameinfo-market-system";

function sanitizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, 200)
    : [];
}

function sanitizeGameinfoRowOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const overrides = {};
  for (const [packId, formula] of Object.entries(value).slice(0, 2000)) {
    if (typeof formula !== "string" || !formula.trim()) continue;
    overrides[String(packId).slice(0, 128)] = formula.trim().slice(0, 500);
  }
  return overrides;
}

function sanitizeGameinfoCategoryFormulas(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const formulas = {};
  for (const [categoryId, formula] of Object.entries(value).slice(0, 500)) {
    if (typeof formula !== "string" || !formula.trim()) continue;
    formulas[String(categoryId).slice(0, 128)] = formula.trim().slice(0, 500);
  }
  return formulas;
}

// Shared with the gameinfo module: a game's computed_column JSONB column
// holds the same shape, so both surfaces can edit it with this one sanitizer.
// A query's formula columns are that query's own, so a handful is plenty. A
// gameinfo pack column is shared by every game, which makes this list the
// whole registry rather than one game's few — hence the second, larger cap.
//
// The size matters beyond storage: a gameinfo save works out which columns
// were removed by diffing what the game had against what it sends, so a list
// silently truncated here would read as "the user deleted the rest" and take
// those definitions away from every game. The route refuses an over-long list
// instead of letting the truncation happen.
export const GAMEDB_QUERY_COLUMN_LIMIT = 30;
export const GAMEINFO_PACK_COLUMN_LIMIT = 200;

export function sanitizeComputedColumns(raw, { limit = GAMEDB_QUERY_COLUMN_LIMIT } = {}) {
  return Array.isArray(raw)
    ? raw
        .filter(
          (col) =>
            col &&
            typeof col.key === "string" &&
            typeof col.label === "string" &&
            typeof col.formula === "string"
        )
        .slice(0, limit)
        .map((col) => ({
          key: col.key.slice(0, 64),
          label: col.label.slice(0, 120),
          formula: col.formula.slice(0, 500),
          // The formula this one game computes instead of the shared one. Kept
          // here or the pack editor's save would drop it and the game would
          // silently fall back to what every other game computes.
          gameFormula:
            typeof col.gameFormula === "string" ? col.gameFormula.slice(0, 500) : "",
          ...(col.gameEntryMode === "manual" || col.gameEntryMode === "formula"
            ? { gameEntryMode: col.gameEntryMode }
            : {}),
          ...(col.gameScopeMode === "category" || col.gameScopeMode === "global"
            ? { gameScopeMode: col.gameScopeMode }
            : {}),
          // Which revision of the shared definition this client was shown.
          // Dropping it here would make every save look like a brand new
          // column to the registry's optimistic lock.
          version: Number.isSafeInteger(Number(col.version)) && Number(col.version) > 0
            ? Number(col.version)
            : undefined,
          entryMode:
            col.entryMode === "manual" ||
            (col.kind !== "market" &&
              !col.formula.trim() &&
              !String(col.gameFormula || "").trim())
              ? "manual"
              : "formula",
          kind: col.kind === "market" ? "market" : "formula",
          marketKey:
            col.kind === "market" && GAMEINFO_MARKET_KEYS.has(col.marketKey)
              ? col.marketKey
              : "",
          enabled: col.kind === "market" ? col.enabled !== false : true,
          // Absent on every column saved before formulas could return text.
          type: COMPUTED_TYPES.includes(col.type) ? col.type : "number",
          // Plain display text only; React escapes it when rendered. Keep the
          // exact spacing so values such as "USD " can control presentation.
          symbol:
            typeof col.symbol === "string" && col.symbol.trim()
              ? col.symbol.slice(0, 24)
              : "",
          // Legacy columns have neither field and remain global. Category
          // formulas stay stored while global mode is active so switching
          // modes never discards the user's work.
          scopeMode: col.scopeMode === "category" ? "category" : "global",
          categoryFormulas: sanitizeGameinfoCategoryFormulas(col.categoryFormulas),
          rowOverrides: sanitizeGameinfoRowOverrides(col.rowOverrides),
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
          optionsSource:
            param.optionsSource === "column" && isSafeIdentifier(param.optionsTable) &&
            isSafeIdentifierPart(param.optionsColumn)
              ? "column"
              : "manual",
          optionsTable: isSafeIdentifier(param.optionsTable) ? String(param.optionsTable) : "",
          optionsColumn: isSafeIdentifierPart(param.optionsColumn)
            ? String(param.optionsColumn)
            : "",
        }))
    : [];
  const rules = Array.isArray(layout.rules)
    ? layout.rules
        .filter(
          (rule) =>
            rule &&
            typeof rule.colId === "string" &&
            RULE_OPS.includes(rule.op) &&
            isValidTone(rule.tone, RULE_TONES)
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
          // Every target names a table and a key column that get quoted
          // straight into an UPDATE, so each is checked the same way the base
          // table is, and one that fails is dropped rather than repaired --
          // those columns then fall back to the base table, where the write
          // either works or fails loudly, instead of landing somewhere the
          // config never really said.
          targets: normalizeEditableTargets(rawEditable.targets)
            .filter(
              (target) =>
                isSafeIdentifier(target.table) &&
                isSafeIdentifierPart(target.pkColumn || target.pk)
            )
            .map((target) => ({
              ...target,
              columns: target.columns.filter((name) => editableColumns.includes(name)),
            }))
            .filter((target) => target.columns.length > 0),
          // A mapping for a column that is not writable is dead weight.
          columnMap: Object.fromEntries(
            Object.entries(columnMap).filter(([name]) => editableColumns.includes(name))
          ),
          // Every table and key name here is quoted straight into an UPDATE,
          // so each branch is checked the same way the base table is, and a
          // set of branches with one bad entry is dropped whole -- a config
          // that can place some rows and not others places the rest wrong.
          rowTargets: (() => {
            const rows = normalizeRowTargets(rawEditable.rowTargets);
            if (!rows) return null;
            const usable = rows.branches.every(
              (branch) =>
                isSafeIdentifier(branch.table) &&
                isSafeIdentifierPart(branch.pkColumn) &&
                Object.values(branch.columnMap).every((real) => isSafeIdentifierPart(real))
            );
            return usable ? rows : null;
          })(),
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
  // Same shape normalizeSort produces, plus the length cap every other
  // string field here gets -- kept as its own pass rather than importing
  // normalizeSort so the 200-char cap on colId only has to be stated once.
  const sortList = Array.isArray(layout.sort)
    ? layout.sort
    : layout.sort && typeof layout.sort === "object"
      ? [layout.sort]
      : [];
  const seenSortCols = new Set();
  const sort = [];
  for (const entry of sortList) {
    if (!entry || typeof entry !== "object" || !entry.colId) continue;
    const colId = String(entry.colId).slice(0, 200);
    if (seenSortCols.has(colId)) continue;
    seenSortCols.add(colId);
    sort.push({ colId, dir: entry.dir === "desc" ? "desc" : "asc" });
    if (sort.length >= MAX_SORT_COLUMNS) break;
  }
  // Merge, lookups and drill only name another saved query and its columns;
  // the join and the navigation happen in the browser, so nothing here reaches
  // SQL. `lookupsFromLayout` also folds a legacy `merge` into a one-item
  // array, so a query saved before lookups existed keeps reading the same way.
  const merge = normalizeMerge(layout.merge);
  const lookups = lookupsFromLayout(layout);
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
    lookups,
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
    tableTone: isValidTone(layout.tableTone, TABLE_TONES) ? layout.tableTone : "",
    tableBorderTone: isValidTone(layout.tableBorderTone, TABLE_TONES)
      ? layout.tableBorderTone
      : "",
  };
}

function capEntries(object, limit) {
  const entries = Object.entries(object).slice(0, limit);
  const capped = {};
  for (const [key, value] of entries) capped[key.slice(0, 200)] = value;
  return capped;
}
