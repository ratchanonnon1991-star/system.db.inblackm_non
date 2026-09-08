import { groupGameinfoColumnFormulas } from "@/lib/gameinfo-column-formula-usage.js";
import { updateGameinfoComputedColumn } from "@/lib/gameinfo-formula-overrides.js";
import { sanitizeComputedColumns } from "@/server/gamedb-layout-sanitizer.js";
import { validateGameinfoComputedDependencies } from "@/lib/gameinfo-computed-evaluator.js";
import { splitGameinfoColumn } from "@/lib/gameinfo-column-registry.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

// --- what other games compute in this column -----------------------------
const grouped = groupGameinfoColumnFormulas([
  { formula: "[ราคา] * 0.9", shared: true },
  { gameName: "HONKAI", formula: "[ราคา] - [ต้นทุน]" },
  { gameName: "NIKKE", formula: "[ราคา] - [ต้นทุน]" },
  // The same game seen twice — its own formula and the legacy copy of it.
  { gameName: "NIKKE", formula: "[ราคา] - [ต้นทุน]" },
  { gameName: "ZZZ", formula: "[ราคา] * 0.5" },
  { gameName: "BLANK", formula: "   " },
]);
check("distinct formulas are grouped", grouped.map((item) => item.formula), [
  "[ราคา] * 0.9",
  "[ราคา] - [ต้นทุน]",
  "[ราคา] * 0.5",
]);
check("the column's own formula leads", grouped[0].shared, true);
check("a game is counted once however often it is seen", grouped[1].gameCount, 2);
check("the games using it are named", grouped[1].games, ["HONKAI", "NIKKE"]);
check("a blank formula is not a suggestion", grouped.some((item) => !item.formula.trim()), false);
check("the shared formula names no game", grouped[0].games, []);
check(
  "a long list is trimmed with a count of the rest",
  groupGameinfoColumnFormulas(
    ["a", "b", "c", "d", "e", "f", "g", "h"].map((gameName) => ({ gameName, formula: "[ราคา]" })),
    { gameLimit: 3 }
  )[0],
  { formula: "[ราคา]", shared: false, gameCount: 8, games: ["a", "b", "c"], moreGames: 5 }
);

// --- Pack-page formula scope ---------------------------------------------
// A whole-column formula belongs to the current game and must leave the
// registry fallback exactly as it was.
const column = {
  key: "col_profit",
  label: "กำไร",
  formula: "[ราคา] * 0.9",
  gameFormula: "",
  entryMode: "formula",
  scopeMode: "global",
  categoryFormulas: {},
  rowOverrides: {},
};
const perGame = updateGameinfoComputedColumn([column], {
  ...column,
  formula: "[ราคา] * 0.9",
  gameFormula: "[ราคา] - [ต้นทุน]",
})[0];
check("a per-game edit keeps the shared formula", perGame.formula, "[ราคา] * 0.9");
check("and stores its own alongside it", perGame.gameFormula, "[ราคา] - [ต้นทุน]");
check(
  "only this game's half is written to its overrides",
  splitGameinfoColumn(perGame).override,
  { gameFormula: "[ราคา] - [ต้นทุน]" }
);
check(
  "and the registry keeps the formula every game computes",
  splitGameinfoColumn(perGame).registry.data.formula,
  "[ราคา] * 0.9"
);

const attemptedSharedEdit = updateGameinfoComputedColumn([perGame], {
  ...perGame,
  formula: "[ราคา] * 0.8",
  gameFormula: "[ราคา] * 0.8",
})[0];
check("a Pack-page edit cannot rewrite the registry fallback", attemptedSharedEdit.formula, "[ราคา] * 0.9");
check("the edited formula stays on this game", attemptedSharedEdit.gameFormula, "[ราคา] * 0.8");
check(
  "the edited formula remains in this game's overrides",
  splitGameinfoColumn(attemptedSharedEdit).override,
  { gameFormula: "[ราคา] * 0.8" }
);

// --- the save path -------------------------------------------------------
const [saved] = sanitizeComputedColumns([
  { key: "col_profit", label: "กำไร", formula: "", gameFormula: "[ราคา] - [ต้นทุน]" },
]);
check("a per-game formula survives the sanitizer", saved.gameFormula, "[ราคา] - [ต้นทุน]");
check(
  "a column with only a per-game formula is still a formula column",
  saved.entryMode,
  "formula"
);
check(
  "a column with no formula at all is filled in by hand",
  sanitizeComputedColumns([{ key: "c", label: "ต้นทุน", formula: "" }])[0].entryMode,
  "manual"
);
check(
  "a per-game formula naming something that does not exist is refused on save",
  validateGameinfoComputedDependencies([
    { key: "c", label: "กำไร", formula: "[ราคา]", gameFormula: "[ไม่มีคอลัมน์นี้] * 2" },
  ]).some((error) => error.includes("ไม่มีคอลัมน์นี้")),
  true
);
check(
  "and a valid one passes",
  validateGameinfoComputedDependencies([
    { key: "c", label: "กำไร", formula: "[ราคา]", gameFormula: "[ราคา] * 2" },
  ]),
  []
);
check(
  "a blank registry formula does not block a valid game formula",
  validateGameinfoComputedDependencies([
    {
      key: "russia",
      label: "ราคาRussia",
      formula: "",
      gameFormula: "[ราคา] * 2",
      entryMode: "formula",
      gameEntryMode: "formula",
      categoryFormulas: {},
      rowOverrides: {},
    },
  ]),
  []
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
