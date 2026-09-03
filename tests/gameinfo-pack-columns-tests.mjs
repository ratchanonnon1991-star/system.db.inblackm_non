import {
  buildGameinfoPackColumns,
  gameinfoColumnsWithData,
  gameinfoPackLayoutKnownIds,
  formatGameinfoPackColumnValue,
  gameinfoPackColumnWidth,
  matchesGameinfoPackFilters,
  normalizeGameinfoPackLayout,
  reorderGameinfoPackColumns,
} from "@/lib/gameinfo-pack-columns.js";
import {
  GAMEDB_QUERY_COLUMN_LIMIT,
  GAMEINFO_PACK_COLUMN_LIMIT,
  sanitizeComputedColumns,
} from "@/server/gamedb-layout-sanitizer.js";
import {
  duplicateGameinfoFormulaOverrides,
  getEffectiveGameinfoFormula,
  getGameinfoFormulaDisplay,
  pruneGameinfoCategoryFormulas,
  pruneGameinfoFormulaOverrides,
  removeGameinfoFormulaOverridesForPack,
  setGameinfoCategoryFormula,
  setGameinfoFormulaOverride,
  updateGameinfoComputedColumn,
} from "@/lib/gameinfo-formula-overrides.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const columns = buildGameinfoPackColumns([
  { key: "profit", label: "กำไร", formula: "[ราคา] * 0.1", type: "number", symbol: "฿" },
]);

check(
  "base and computed columns use one collision-safe id namespace",
  columns.map((column) => column.id),
  [
    "serviceEnabled",
    "image",
    "name",
    "price",
    "amountChargedFee",
    "channelsMain",
    "channelsSecondary",
    "country",
    "computed:profit",
  ]
);
check("short pack names use the column minimum", gameinfoPackColumnWidth(columns.find((column) => column.id === "name"), ["60 Crystals"]), 140);
check("pack names grow with their longest value", gameinfoPackColumnWidth(columns.find((column) => column.id === "name"), ["A".repeat(30)]), 257);
check("very long pack names wrap at the column maximum", gameinfoPackColumnWidth(columns.find((column) => column.id === "name"), ["A".repeat(100)]), 360);
check("channel width keeps multiple tags and the input on one line", gameinfoPackColumnWidth(columns.find((column) => column.id === "channelsMain"), [["Itemku", "Topup Youthshop"]]), 316);

const normalized = normalizeGameinfoPackLayout(
  { order: ["computed:profit", "price", "missing"], hidden: ["country", "missing", "country"] },
  columns
);
check("layout pins the service status column to the front", normalized.order, [
  "serviceEnabled",
  "computed:profit",
  "price",
  "image",
  "name",
  "amountChargedFee",
  "channelsMain",
  "channelsSecondary",
  "country",
]);
check("layout drops unknown, duplicate, and hidden status ids", normalized.hidden, ["country"]);
check("layout defaults to no row filters", normalized.filters, []);

// A preset saved before a column existed: the column is appended to the end of
// the order and is never auto-hidden, so it shows up for everyone who saved
// that preset. Pinned here because it is the rule the shared column registry
// changes — a saved preset must stop absorbing newly added columns.
const layoutWithLateColumn = normalizeGameinfoPackLayout(
  { order: ["price", "name"], hidden: [] },
  buildGameinfoPackColumns([{ key: "late", label: "มาทีหลัง", formula: "1" }])
);
check(
  "a column added after the preset was saved lands at the end of the order",
  layoutWithLateColumn.order.at(-1),
  "computed:late"
);
check("a column added after the preset was saved stays visible", layoutWithLateColumn.hidden, []);

// Once a preset records what existed when it was saved, columns registered
// later (shared across every game) start hidden instead.
const stampedColumns = buildGameinfoPackColumns([
  { key: "old", label: "เดิม", formula: "1" },
  { key: "late", label: "มาทีหลัง", formula: "1" },
]);
const stampedLayout = normalizeGameinfoPackLayout(
  {
    order: ["price", "computed:old"],
    hidden: [],
    knownIds: ["serviceEnabled", "image", "name", "price", "amountChargedFee",
      "channelsMain", "channelsSecondary", "country", "computed:old"],
  },
  stampedColumns
);
check("a preset hides columns registered after it was saved", stampedLayout.hidden, ["computed:late"]);
check(
  "a preset still shows every column it was saved with",
  stampedLayout.order.filter((id) => !stampedLayout.hidden.includes(id)).includes("computed:old"),
  true
);
check(
  "the pinned status column is never auto-hidden",
  normalizeGameinfoPackLayout({ knownIds: [] }, stampedColumns).hidden.includes("serviceEnabled"),
  false
);
check(
  "knownIds are stamped from the live columns",
  gameinfoPackLayoutKnownIds(buildGameinfoPackColumns([{ key: "x", label: "X", formula: "1" }])).at(-1),
  "computed:x"
);

// A shared column is registered for every game; "empty here" is decided by
// whether any pack in this game produces a value for it.
const dataColumns = buildGameinfoPackColumns([
  { key: "filled", label: "มีค่า", formula: "1" },
  { key: "blank", label: "ว่าง", formula: "" },
]);
const withData = gameinfoColumnsWithData(
  dataColumns,
  [{ id: "pk_1" }, { id: "pk_2" }],
  (column, pack) => (column.id === "computed:filled" && pack.id === "pk_2" ? 42 : undefined)
);
check("a column one pack fills counts as having data", withData.has("computed:filled"), true);
check("a column no pack fills counts as empty", withData.has("computed:blank"), false);
check("base columns always count as having data", withData.has("price"), true);
check(
  "a game with no packs at all has no computed data",
  gameinfoColumnsWithData(dataColumns, [], () => 1).has("computed:filled"),
  false
);
check(
  "blank strings and nulls do not count as data",
  gameinfoColumnsWithData(dataColumns, [{ id: "pk_1" }], () => "").has("computed:filled"),
  false
);

const filteredLayout = normalizeGameinfoPackLayout(
  {
    filters: [
      { columnId: "name", operator: "contains", value: "diamond" },
      { columnId: "missing", operator: "equals", value: "x" },
    ],
  },
  columns
);
check("layout keeps filters for known columns", filteredLayout.filters, [
  { columnId: "name", operator: "contains", value: "diamond" },
]);
check(
  "pack filters compare arrays and text case-insensitively",
  matchesGameinfoPackFilters(
    { name: "86 Diamonds", channelsMain: ["WavePay"] },
    [
      { columnId: "name", operator: "contains", value: "DIAMOND" },
      { columnId: "channelsMain", operator: "equals", value: "wavepay" },
    ],
    (columnId, pack) => pack[columnId]
  ),
  true
);
check(
  "empty filter rejects a populated value",
  matchesGameinfoPackFilters(
    { country: "TH" },
    [{ columnId: "country", operator: "empty", value: "" }],
    (columnId, pack) => pack[columnId]
  ),
  false
);

check(
  "column reorder moves one id without losing the others",
  reorderGameinfoPackColumns(normalized, "price", "channelsMain").order,
  [
    "serviceEnabled",
    "computed:profit",
    "image",
    "name",
    "amountChargedFee",
    "channelsMain",
    "price",
    "channelsSecondary",
    "country",
  ]
);

check(
  "baht symbol is a prefix on a numeric computed result",
  formatGameinfoPackColumnValue(1234.5, { type: "number", symbol: "฿" }),
  "฿1,234.5"
);
check(
  "percent symbol is a suffix",
  formatGameinfoPackColumnValue(12.5, { type: "number", symbol: "%" }),
  "12.5%"
);
check(
  "custom display text is prefixed exactly as saved",
  formatGameinfoPackColumnValue(25, { type: "number", symbol: "Coins " }),
  "Coins 25"
);
check(
  "symbols are not added to an empty result",
  formatGameinfoPackColumnValue(null, { type: "number", symbol: "$" }),
  "—"
);
check(
  "computed sanitizer preserves custom display text",
  sanitizeComputedColumns([
    { key: "a", label: "บาท", formula: "1", type: "number", symbol: "฿" },
    { key: "b", label: "แต้ม", formula: "2", type: "number", symbol: "Coins " },
  ]).map((column) => column.symbol),
  ["฿", "Coins "]
);
check(
  "computed sanitizer limits custom display text length",
  sanitizeComputedColumns([
    { key: "long", label: "ยาว", formula: "1", type: "number", symbol: "x".repeat(40) },
  ])[0].symbol.length,
  24
);

const sanitizedOverrides = sanitizeComputedColumns([
  {
    key: "profit",
    label: "กำไร",
    formula: "[ราคา] - [ยอดที่กด + fee]",
    type: "number",
    rowOverrides: {
      pk_special: "[ราคา] * 0.5",
      empty: "   ",
      hostile: 123,
    },
  },
])[0].rowOverrides;
check("computed sanitizer keeps only non-empty string row overrides", sanitizedOverrides, {
  pk_special: "[ราคา] * 0.5",
});

const sanitizedManualColumn = sanitizeComputedColumns([{
  key: "manual-cost",
  label: "ต้นทุนกรอกเอง",
  formula: "",
  entryMode: "manual",
  rowOverrides: { pk_1: "125", pk_2: "[ราคา] * 0.9" },
}])[0];
check("computed sanitizer preserves a blank manual column", sanitizedManualColumn.entryMode, "manual");
check("manual column keeps per-pack numbers and formulas", sanitizedManualColumn.rowOverrides, {
  pk_1: "125",
  pk_2: "[ราคา] * 0.9",
});
check(
  "blank legacy columns recover as manual so existing row values can be saved",
  sanitizeComputedColumns([{
    key: "russia",
    label: "Russia",
    formula: "",
    rowOverrides: { pk_1: "18.5" },
  }])[0].entryMode,
  "manual"
);

const sanitizedCategoryColumn = sanitizeComputedColumns([
  {
    key: "profit",
    label: "กำไร",
    formula: "[ราคา] * 0.1",
    type: "number",
    scopeMode: "category",
    categoryFormulas: {
      cat_diamond: "[ราคา] * 0.2",
      empty: "   ",
      hostile: 123,
    },
  },
])[0];
check("computed sanitizer preserves category scope", sanitizedCategoryColumn.scopeMode, "category");
check("computed sanitizer keeps only valid category formulas", sanitizedCategoryColumn.categoryFormulas, {
  cat_diamond: "[ราคา] * 0.2",
});
check(
  "legacy computed columns default to global scope",
  sanitizeComputedColumns([{ key: "old", label: "เดิม", formula: "1" }])[0].scopeMode,
  "global"
);

// The sanitizer used to carry a hardcoded market list that fell behind
// GAMEINFO_MARKETS: a G2G column had its marketKey blanked here and then died
// on the `key === market_${marketKey}` check in the packs route.
check(
  "computed sanitizer accepts every registered market",
  sanitizeComputedColumns(
    ["kaleoz", "itemku", "g2g"].map((market) => ({
      key: `market_${market}`,
      label: market,
      formula: "[ราคา]",
      kind: "market",
      marketKey: market,
    }))
  ).map((column) => column.marketKey),
  ["kaleoz", "itemku", "g2g"]
);
check(
  "computed sanitizer still rejects an unregistered market",
  sanitizeComputedColumns([{
    key: "market_playerok",
    label: "Playerok",
    formula: "[ราคา]",
    kind: "market",
    marketKey: "playerok",
  }])[0].marketKey,
  ""
);

const formulaColumn = {
  key: "profit",
  formula: "[ราคา] - [ยอดที่กด + fee]",
  rowOverrides: { pk_special: "[ราคา] * 0.5" },
};
check("effective formula falls back to the column formula", getEffectiveGameinfoFormula(formulaColumn, "pk_normal"), {
  formula: "[ราคา] - [ยอดที่กด + fee]",
  overridden: false,
  source: "main",
});
check("effective formula uses a pack override", getEffectiveGameinfoFormula(formulaColumn, "pk_special"), {
  formula: "[ราคา] * 0.5",
  overridden: true,
  source: "override",
});
check("formula display identifies an inherited main formula", getGameinfoFormulaDisplay(formulaColumn, "pk_normal"), {
  formula: "[ราคา] - [ยอดที่กด + fee]",
  overridden: false,
  source: "main",
  sourceLabel: "สูตรหลัก",
});
check("formula display identifies a pack override", getGameinfoFormulaDisplay(formulaColumn, "pk_special"), {
  formula: "[ราคา] * 0.5",
  overridden: true,
  source: "override",
  sourceLabel: "สูตรเฉพาะ pack",
});
check("an empty manual cell does not inherit a main formula", getGameinfoFormulaDisplay({
  key: "manual",
  formula: "",
  entryMode: "manual",
  rowOverrides: { pk_filled: "123" },
}, "pk_empty"), {
  formula: "",
  overridden: false,
  source: "manual",
  sourceLabel: "กรอกเอง",
});

const categoryColumn = {
  ...formulaColumn,
  scopeMode: "category",
  categoryFormulas: { cat_diamond: "[ราคา] * 0.2" },
};
check(
  "category mode uses a formula keyed by category id",
  getGameinfoFormulaDisplay(categoryColumn, "pk_normal", "cat_diamond"),
  {
    formula: "[ราคา] * 0.2",
    overridden: true,
    source: "category",
    sourceLabel: "สูตรเฉพาะหมวด",
  }
);
check(
  "a category without its own formula falls back to the main formula",
  getGameinfoFormulaDisplay(categoryColumn, "pk_normal", "cat_coin").source,
  "main"
);
check(
  "a pack override wins over its category formula",
  getGameinfoFormulaDisplay(categoryColumn, "pk_special", "cat_diamond").source,
  "override"
);

const changedCategory = setGameinfoCategoryFormula(
  [categoryColumn],
  "profit",
  "cat_coin",
  "[ราคา] * 0.3"
);
check("setting a category formula does not change other categories", changedCategory[0].categoryFormulas, {
  cat_diamond: "[ราคา] * 0.2",
  cat_coin: "[ราคา] * 0.3",
});
check(
  "saving prunes formulas for categories that no longer exist",
  pruneGameinfoCategoryFormulas(changedCategory, ["cat_coin"])[0].categoryFormulas,
  { cat_coin: "[ราคา] * 0.3" }
);

const changed = setGameinfoFormulaOverride([formulaColumn], "profit", "pk_special", "");
check("clearing an override restores inheritance", changed[0].rowOverrides, {});

const copied = duplicateGameinfoFormulaOverrides([formulaColumn], "pk_special", "pk_copy");
check("duplicating a pack copies its row formula override to the new id", copied[0].rowOverrides, {
  pk_special: "[ราคา] * 0.5",
  pk_copy: "[ราคา] * 0.5",
});
check(
  "removing a pack also removes its orphaned override",
  removeGameinfoFormulaOverridesForPack(copied, "pk_special")[0].rowOverrides,
  { pk_copy: "[ราคา] * 0.5" }
);
check(
  "saving prunes overrides for packs that no longer exist",
  pruneGameinfoFormulaOverrides(copied, ["pk_copy"])[0].rowOverrides,
  { pk_copy: "[ราคา] * 0.5" }
);

const updatedMainFormula = updateGameinfoComputedColumn(
  [formulaColumn],
  { key: "profit", label: "กำไรใหม่", formula: "[ราคา] * 2", type: "number", symbol: "฿" }
);
check("editing a main formula keeps explicit row overrides by default", updatedMainFormula[0], {
  key: "profit",
  formula: "[ราคา] * 2",
  rowOverrides: { pk_special: "[ราคา] * 0.5" },
  label: "กำไรใหม่",
  // Empty because this edit was scoped to every game: the editor writes the
  // text to one of `formula` and `gameFormula` and clears the other.
  gameFormula: "",
  type: "number",
  symbol: "฿",
  scopeMode: "global",
  categoryFormulas: {},
});
check(
  "an edit scoped to this game leaves the shared formula alone",
  updateGameinfoComputedColumn(
    [formulaColumn],
    { key: "profit", label: "กำไร", formula: formulaColumn.formula, gameFormula: "[ราคา] * 4", type: "number", symbol: "฿" }
  )[0],
  { ...updatedMainFormula[0], label: "กำไร", formula: formulaColumn.formula, gameFormula: "[ราคา] * 4" }
);
check(
  "editing main formula can deliberately apply it to every pack by clearing overrides",
  updateGameinfoComputedColumn(updatedMainFormula, { ...updatedMainFormula[0], formula: "[ราคา] * 3" }, { resetOverrides: true })[0].rowOverrides,
  {}
);

// --- how many columns fit ------------------------------------------------
// A query's formula columns belong to that query; a pack column is shared by
// every game, so the list being sanitized is the whole registry and the old
// 30 that suited a query is far too few. Truncating is what makes this worth
// a test: a gameinfo save deletes the columns it does not send, so a list cut
// down to the cap would take the rest away from every game.
const manyColumns = Array.from({ length: 120 }, (_, index) => ({
  key: `col_${index}`,
  label: `คอลัมน์ ${index}`,
  formula: "[ราคา]",
}));
check("a query keeps its small cap", sanitizeComputedColumns(manyColumns).length, GAMEDB_QUERY_COLUMN_LIMIT);
check(
  "pack columns are capped far higher, because the list is every game's",
  sanitizeComputedColumns(manyColumns, { limit: GAMEINFO_PACK_COLUMN_LIMIT }).length,
  120
);
check("and the cap is still a cap", GAMEINFO_PACK_COLUMN_LIMIT > GAMEDB_QUERY_COLUMN_LIMIT, true);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
