import {
  clearGameinfoColumnReferences,
  formatGameinfoColumnReference,
  listGameinfoColumnReferences,
} from "@/lib/gameinfo-column-dependencies.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const columns = [
  { key: "cost", label: "ต้นทุน", formula: "", rowOverrides: {} },
  {
    key: "profit",
    label: "กำไร",
    formula: "[ราคา] - [ต้นทุน]",
    gameFormula: "[ราคา] - [ต้นทุน] * 2",
    entryMode: "formula",
    categoryFormulas: { cat_1: "[ราคา] - [ต้นทุน] * 3", cat_2: "[ราคา]" },
    rowOverrides: { pack_1: "[ราคา] - [ต้นทุน] * 4", pack_2: "[ราคา]" },
  },
];
const context = {
  gameId: 7,
  gameName: "Test Game",
  dataMode: "uid",
  includeShared: true,
  currencies: [{ categories: [{ id: "cat_1", name: "เพชร", packs: [{ id: "pack_1", name: "60 เพชร" }] }] }],
};
const references = listGameinfoColumnReferences(columns, "cost", "ต้นทุน", context);
check("all formula scopes are reported", references.map((item) => item.scope), ["column", "game", "category", "pack"]);
check("category names are included", references[2].categoryName, "เพชร");
check("pack names are included", references[3].packName, "60 เพชร");
check(
  "a pack reference formats its full location",
  formatGameinfoColumnReference(references[3]),
  "Test Game (UID) → กำไร → Pack “60 เพชร”"
);

const cleaned = clearGameinfoColumnReferences(columns, "cost", "ต้นทุน");
check("the target column is deleted", cleaned.map((column) => column.key), ["profit"]);
check("a deleted shared formula makes the destination manual", [cleaned[0].formula, cleaned[0].entryMode], ["", "manual"]);
check("a deleted game formula makes this game manual", [cleaned[0].gameFormula, cleaned[0].gameEntryMode], ["", "manual"]);
check("only affected category formulas are cleared", cleaned[0].categoryFormulas, { cat_2: "[ราคา]" });
check("only affected Pack formulas are cleared", cleaned[0].rowOverrides, { pack_2: "[ราคา]" });

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
