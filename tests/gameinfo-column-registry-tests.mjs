import {
  flattenGameinfoColumnsForLegacy,
  mergeGameinfoColumn,
  mergeGameinfoColumns,
  pickSharedGameinfoFormula,
  splitGameinfoColumn,
  splitGameinfoColumns,
} from "@/lib/gameinfo-column-registry.js";
import {
  getEffectiveGameinfoFormula,
  getGameinfoFormulaDisplay,
} from "@/lib/gameinfo-formula-overrides.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const editedColumn = {
  key: "profit",
  label: "กำไร",
  formula: "[ราคา] - [ยอดที่กด + fee]",
  entryMode: "formula",
  kind: "formula",
  marketKey: "",
  type: "number",
  symbol: "฿",
  scopeMode: "global",
  gameFormula: "",
  enabled: true,
  categoryFormulas: {},
  rowOverrides: {},
};

const split = splitGameinfoColumn(editedColumn, 3);
check("the shared half carries the definition", split.registry, {
  columnKey: "profit",
  label: "กำไร",
  sortOrder: 3,
  data: {
    formula: "[ราคา] - [ยอดที่กด + fee]",
    entryMode: "formula",
    kind: "formula",
    marketKey: "",
    type: "number",
    symbol: "฿",
    scopeMode: "global",
  },
});
check("a game using the column as-is leaves no override", split.override, null);

check(
  "merging the halves rebuilds the column the UI reads",
  mergeGameinfoColumn(split.registry, {}),
  editedColumn
);

const localised = splitGameinfoColumn(
  {
    ...editedColumn,
    gameFormula: "[ราคา] * 0.8",
    categoryFormulas: { cat_gem: "[ราคา] * 0.7" },
    rowOverrides: { pk_1: "42" },
  },
  0
);
check("a game that computes it differently stores only its own half", localised.override, {
  gameFormula: "[ราคา] * 0.8",
  categoryFormulas: { cat_gem: "[ราคา] * 0.7" },
  rowOverrides: { pk_1: "42" },
});
check(
  "the shared definition is unchanged by a game's override",
  localised.registry.data.formula,
  "[ราคา] - [ยอดที่กด + fee]"
);

check(
  "a market column switched off in one game stores that, and only that",
  splitGameinfoColumn({ ...editedColumn, kind: "market", marketKey: "g2g", enabled: false }).override,
  { enabled: false }
);
check(
  "a market column left on stores nothing",
  splitGameinfoColumn({ ...editedColumn, kind: "market", marketKey: "g2g", enabled: true }).override,
  null
);

const many = splitGameinfoColumns([
  editedColumn,
  { ...editedColumn, key: "cost", label: "ต้นทุน", rowOverrides: { pk_9: "7" } },
]);
check("splitting keeps registry order", many.registry.map((row) => row.sortOrder), [0, 1]);
check("splitting collects overrides by column key", Object.keys(many.overrides), ["cost"]);

// The whole point of the registry: a game that never created this column now
// sees it anyway.
const otherGame = mergeGameinfoColumns(many.registry, {});
check("every game sees every registered column", otherGame.map((column) => column.key), [
  "profit",
  "cost",
]);
check("a game with no override inherits the shared formula", otherGame[1].rowOverrides, {});

check(
  "a column dropped from the registry disappears from every game",
  mergeGameinfoColumns([many.registry[0]], many.overrides).map((column) => column.key),
  ["profit"]
);

// --- formula precedence, with the game layer inserted --------------------
const shared = { key: "p", formula: "[ราคา]", scopeMode: "category" };
check("the shared formula applies when the game says nothing", getEffectiveGameinfoFormula(shared, "pk_1"), {
  formula: "[ราคา]",
  overridden: false,
  source: "main",
});
check(
  "a game formula beats the shared one",
  getEffectiveGameinfoFormula({ ...shared, gameFormula: "[ราคา] * 2" }, "pk_1"),
  { formula: "[ราคา] * 2", overridden: true, source: "game" }
);
check(
  "a category formula beats the game formula",
  getEffectiveGameinfoFormula(
    { ...shared, gameFormula: "[ราคา] * 2", categoryFormulas: { c1: "[ราคา] * 3" } },
    "pk_1",
    "c1"
  ).source,
  "category"
);
check(
  "a pack override beats the game formula",
  getEffectiveGameinfoFormula(
    { ...shared, gameFormula: "[ราคา] * 2", rowOverrides: { pk_1: "[ราคา] * 4" } },
    "pk_1"
  ).source,
  "override"
);
check(
  "a blank game formula is ignored rather than blanking the column",
  getEffectiveGameinfoFormula({ ...shared, gameFormula: "   " }, "pk_1").source,
  "main"
);
check(
  "the game layer has its own label",
  getGameinfoFormulaDisplay({ ...shared, gameFormula: "[ราคา] * 2" }, "pk_1").sourceLabel,
  "สูตรเฉพาะเกม"
);

// --- rollback shape ------------------------------------------------------
check(
  "the legacy array folds the game formula back into formula",
  flattenGameinfoColumnsForLegacy([{ key: "p", formula: "[ราคา]", gameFormula: "[ราคา] * 2" }]),
  [{ key: "p", formula: "[ราคา] * 2" }]
);
check(
  "a column with no game formula is written unchanged",
  flattenGameinfoColumnsForLegacy([{ key: "p", formula: "[ราคา]", gameFormula: "" }]),
  [{ key: "p", formula: "[ราคา]" }]
);

// --- backfill ------------------------------------------------------------
check(
  "the most common formula becomes the shared one",
  pickSharedGameinfoFormula(["[ราคา]", "[ราคา] * 2", "[ราคา]"]),
  "[ราคา]"
);
check("ties keep the first formula seen", pickSharedGameinfoFormula(["a", "b"]), "a");
check("no formulas at all yields a blank shared formula", pickSharedGameinfoFormula([]), "");

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
