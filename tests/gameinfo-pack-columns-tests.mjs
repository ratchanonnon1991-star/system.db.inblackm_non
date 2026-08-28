import {
  buildGameinfoPackColumns,
  formatGameinfoPackColumnValue,
  matchesGameinfoPackFilters,
  normalizeGameinfoPackLayout,
  reorderGameinfoPackColumns,
} from "@/lib/gameinfo-pack-columns.js";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer.js";
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
  type: "number",
  symbol: "฿",
  scopeMode: "global",
  categoryFormulas: {},
});
check(
  "editing main formula can deliberately apply it to every pack by clearing overrides",
  updateGameinfoComputedColumn(updatedMainFormula, { ...updatedMainFormula[0], formula: "[ราคา] * 3" }, { resetOverrides: true })[0].rowOverrides,
  {}
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
