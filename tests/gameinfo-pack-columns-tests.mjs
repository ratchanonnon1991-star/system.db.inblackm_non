import {
  buildGameinfoPackColumns,
  formatGameinfoPackColumnValue,
  normalizeGameinfoPackLayout,
  reorderGameinfoPackColumns,
} from "@/lib/gameinfo-pack-columns.js";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer.js";
import {
  duplicateGameinfoFormulaOverrides,
  getEffectiveGameinfoFormula,
  getGameinfoFormulaDisplay,
  pruneGameinfoFormulaOverrides,
  removeGameinfoFormulaOverridesForPack,
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
    "image",
    "name",
    "price",
    "amountChargedFee",
    "costProfileId",
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
check("layout keeps known saved order then appends new columns", normalized.order, [
  "computed:profit",
  "price",
  "image",
  "name",
  "amountChargedFee",
  "costProfileId",
  "channelsMain",
  "channelsSecondary",
  "country",
]);
check("layout drops unknown and duplicate hidden ids", normalized.hidden, ["country"]);

check(
  "column reorder moves one id without losing the others",
  reorderGameinfoPackColumns(normalized, "price", "channelsMain").order,
  [
    "computed:profit",
    "image",
    "name",
    "amountChargedFee",
    "costProfileId",
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
  "symbols are not added to an empty result",
  formatGameinfoPackColumnValue(null, { type: "number", symbol: "$" }),
  "—"
);
check(
  "computed sanitizer keeps only supported display symbols",
  sanitizeComputedColumns([
    { key: "a", label: "บาท", formula: "1", type: "number", symbol: "฿" },
    { key: "b", label: "bad", formula: "2", type: "number", symbol: "<script>" },
  ]).map((column) => column.symbol),
  ["฿", ""]
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

const formulaColumn = {
  key: "profit",
  formula: "[ราคา] - [ยอดที่กด + fee]",
  rowOverrides: { pk_special: "[ราคา] * 0.5" },
};
check("effective formula falls back to the column formula", getEffectiveGameinfoFormula(formulaColumn, "pk_normal"), {
  formula: "[ราคา] - [ยอดที่กด + fee]",
  overridden: false,
});
check("effective formula uses a pack override", getEffectiveGameinfoFormula(formulaColumn, "pk_special"), {
  formula: "[ราคา] * 0.5",
  overridden: true,
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
});
check(
  "editing main formula can deliberately apply it to every pack by clearing overrides",
  updateGameinfoComputedColumn(updatedMainFormula, { ...updatedMainFormula[0], formula: "[ราคา] * 3" }, { resetOverrides: true })[0].rowOverrides,
  {}
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
