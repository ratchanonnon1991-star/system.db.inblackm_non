import { planGameinfoCsvImport } from "@/server/gameinfo-csv-import.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const games = [
  { id: 3, game: "LOVE AND DEEPSPACE" },
  { id: 1, game: "HONKAI IMPACT" },
];
const pack = {
  currency_name: "Gem",
  category_name: "Gem",
  pack_name: "60 Gems",
  price: "100",
  amount_charged_fee: "90",
  channel_main: "Wavepay",
  country: "Thailand",
};

function plan(rows, existingColumns = [], variableNames = []) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return planGameinfoCsvImport({ headers, rows, existingGames: games, existingColumns, variableNames });
}

// --- the file the importer has always accepted ---------------------------
const plain = plan([{ ...pack, game_id: "3" }]);
check("a plain file still imports into its game", plain.games.map((g) => g.gameId), [3]);
check("a plain file creates no game", plain.newGames, []);
check("a plain file creates no column", plain.newColumns, []);
check("a plain file reports no error", plain.errors, []);
check("packs are counted", plain.games[0].packCount, 1);

// --- a new column --------------------------------------------------------
const withColumn = plan([
  { ...pack, game_id: "3", "ต้นทุน": "70" },
  { ...pack, game_id: "3", pack_name: "120 Gems", "ต้นทุน": "140" },
]);
check("an unknown header becomes a new column", withColumn.newColumns.map((c) => c.label), ["ต้นทุน"]);
check("the new column reports how many values it carries", withColumn.newColumns[0].valueCount, 2);
check("its values are attached to the game", Object.keys(withColumn.games[0].columns[0].rowOverrides).length, 2);

const known = plan([{ ...pack, game_id: "3", "ต้นทุน": "70" }], [{ key: "col_cost", label: "ต้นทุน" }]);
check("a header naming a registered column creates nothing", known.newColumns, []);
check("but it is still listed as a column being written", known.columns.map((c) => c.label), ["ต้นทุน"]);
check("and it writes through the registered key", known.games[0].columns[0].key, "col_cost");

// One column shared by two games is one column, not one per game.
const twoGames = plan([
  { ...pack, game_id: "3", "กำไร": "[ราคา] * 1.05" },
  { ...pack, game_id: "1", "กำไร": "[ราคา] * 1.05" },
]);
check("a column used by two games is registered once", twoGames.newColumns.length, 1);
check("its value count covers both games", twoGames.newColumns[0].valueCount, 2);
check("both games are written to", twoGames.games.map((g) => g.gameId).sort(), [1, 3]);
// The key was minted per game, so the same header could arrive with a
// different key from each one. The apply route keeps a game's columns by the
// key the merged list reports, so every game that disagreed was dropped along
// with the per-pack formulas it carried — the column appeared and the formulas
// did not.
check(
  "every game carries the same key for that column",
  [...new Set(twoGames.games.flatMap((g) => g.columns.map((c) => c.key)))].length,
  1
);
check(
  "and it is the key the merged list reports",
  twoGames.games.every((g) => g.columns.every((c) => c.key === twoGames.columns[0].key)),
  true
);

// A game that carries no value for a column is still a game the column is
// written to, and it must not take the key away from the game that has the
// values: the empty game is built first here.
const emptyFirst = plan([
  { ...pack, game_id: "1" },
  { ...pack, game_id: "3", "ส่วนลด": "[ราคา] * 0.3" },
]);
check(
  "a game with no values does not fork the column key",
  [...new Set(emptyFirst.games.flatMap((g) => g.columns.map((c) => c.key)))].length,
  1
);
check(
  "the game with values keeps its per-pack formulas",
  emptyFirst.games
    .filter((g) => g.gameId === 3)
    .flatMap((g) => Object.values(g.columns[0].rowOverrides)),
  ["[ราคา] * 0.3"]
);

// --- a new game ----------------------------------------------------------
const newGame = plan([{ ...pack, game_name: "VALORANT MOBILE" }]);
check("a row naming no known game proposes one", newGame.newGames.map((g) => g.gameName), ["VALORANT MOBILE"]);
check("a proposed game has no id yet", newGame.games[0].gameId, null);
check("proposing a game is not an error", newGame.errors, []);

const namedExisting = plan([{ ...pack, game_name: "LOVE AND DEEPSPACE" }]);
check("an exact name writes to the game it names", namedExisting.games.map((g) => g.gameId), [3]);
check("and creates nothing", namedExisting.newGames, []);
check("the preview can say it matched by name", namedExisting.games[0].matchedByName, true);

const typo = plan([{ ...pack, game_name: "HONKAI IMPAC" }]);
check("a near-miss name is still proposed", typo.newGames.length, 1);
check("with the game it resembles attached", typo.newGames[0].similar, ["HONKAI IMPACT"]);
check("and a warning rather than an error", typo.errors.length, 0);
check("the warning is surfaced", typo.warnings.length, 1);

// A file of nothing but new columns, keyed by game name — the case the whole
// feature exists for.
const columnsOnly = plan([
  { game_name: "LOVE AND DEEPSPACE", "หมายเหตุ": "ข้อมูล" },
  { game_name: "HONKAI IMPACT", "หมายเหตุ": "ข้อมูล" },
]);
check("a file with no packs still registers the column", columnsOnly.newColumns.map((c) => c.label), ["หมายเหตุ"]);
check("it creates no game", columnsOnly.newGames, []);
check("and reports no error", columnsOnly.errors, []);

// --- errors --------------------------------------------------------------
check(
  "an unknown game_id is refused",
  plan([{ ...pack, game_id: "999" }]).errors.some((e) => e.includes("999")),
  true
);
check(
  "a row missing required pack fields is refused",
  plan([{ game_id: "3", currency_name: "Gem", pack_name: "X", price: "" }]).errors.length > 0,
  true
);
check(
  "a broken formula in a cell is refused",
  plan([{ ...pack, game_id: "3", "กำไร": "[ราคา] *" }]).errors.some((e) => e.includes("กำไร")),
  true
);
check(
  "the retired amount_charged column warns rather than fails",
  plan([{ ...pack, game_id: "3", amount_charged: "50" }]).warnings.some((w) => w.includes("amount_charged")),
  true
);
check(
  "and it is not mistaken for a new column",
  plan([{ ...pack, game_id: "3", amount_charged: "50" }]).newColumns,
  []
);
check(
  "two packs sharing a name and price are refused",
  plan([
    { ...pack, game_id: "3" },
    { ...pack, game_id: "3" },
  ]).errors.some((e) => e.includes("ซ้ำ")),
  true
);

// A bracketed name nothing answers to is not a syntax error — it parses and
// then evaluates to nothing, so the column would render blank forever. Told,
// not refused: the user can fix the file or leave the column unticked.
const dangling = plan([{ ...pack, game_id: "3", "กำไร": "[ไม่มีตัวแปรนี้] * 2" }]);
check("an unknown reference is not an error", dangling.errors, []);
check("an unknown reference is reported", dangling.warnings.some((w) => w.includes("ไม่มีตัวแปรนี้")), true);
check("and named on the column itself", dangling.newColumns[0].unknownRefs, ["ไม่มีตัวแปรนี้"]);
check(
  "a built-in pack field resolves",
  plan([{ ...pack, game_id: "3", "กำไร": "[ราคา] * 2" }]).newColumns[0].unknownRefs,
  []
);
check(
  "a formula variable resolves",
  plan([{ ...pack, game_id: "3", "กำไร": "[USDT/THB] * 2" }], [], ["USDT/THB"]).newColumns[0].unknownRefs,
  []
);
check(
  "an already-registered column resolves",
  plan([{ ...pack, game_id: "3", "กำไร": "[ต้นทุน] * 2" }], [{ key: "col_cost", label: "ต้นทุน" }])
    .newColumns[0].unknownRefs,
  []
);
check(
  "another column introduced by the same file resolves",
  plan([{ ...pack, game_id: "3", "ต้นทุน": "70", "กำไร": "[ต้นทุน] * 2" }])
    .columns.find((column) => column.label === "กำไร").unknownRefs,
  []
);

// Countries are normalized on the way in, as they always have been.
const country = plan([{ ...pack, game_id: "3", country: "ไทย" }]);
check("a recognised country is canonicalized", country.games[0].currencies[0].categories[0].packs[0].country, "Thailand");
check(
  "an unrecognised country is reported, not silently kept",
  plan([{ ...pack, game_id: "3", country: "Thailandd" }]).countryIssues.length,
  1
);

// --- a formula in the file belongs to the games the file names -----------
// A column definition is shared by every game, so a formula written into it
// would be computed by all 216 of them. Three ways that used to happen:
//
//   a) one game states a rule -> it became the rule for every game
//   b) two games state different rules -> whichever was built first won and
//      the other was dropped without a word
//   c) a game that left the column blank was built first -> it registered an
//      empty rule and the game that had one lost it, per-pack copies included
const onlyOneGame = plan([
  { ...pack, game_id: "3", "กำไร": "[ราคา] * 0.1" },
  { ...pack, game_id: "3", pack_name: "120 Gems", "กำไร": "[ราคา] * 0.1" },
  { ...pack, game_id: "1", "กำไร": "" },
  { ...pack, game_id: "1", pack_name: "120 Gems", "กำไร": "" },
]);
const byGame = (result) => Object.fromEntries(result.games.map((game) => [game.gameId, game.columns[0]]));
check("(a) the game that stated the rule keeps it", byGame(onlyOneGame)[3].gameFormula, "[ราคา] * 0.1");
check("(a) and no other game is given it", byGame(onlyOneGame)[1].gameFormula, "");
check(
  "(a) the shared definition stays empty, so the other 215 games are untouched",
  onlyOneGame.games.every((game) => game.columns[0].formula === ""),
  true
);

const disagree = plan([
  { ...pack, game_id: "3", "กำไร": "[ราคา] * 0.1" },
  { ...pack, game_id: "3", pack_name: "120 Gems", "กำไร": "[ราคา] * 0.1" },
  { ...pack, game_id: "1", "กำไร": "[ราคา] * 0.9" },
  { ...pack, game_id: "1", pack_name: "120 Gems", "กำไร": "[ราคา] * 0.9" },
]);
check("(b) each game keeps the rule it stated", [byGame(disagree)[3].gameFormula, byGame(disagree)[1].gameFormula], [
  "[ราคา] * 0.1",
  "[ราคา] * 0.9",
]);
check("(b) the preview reports both", disagree.columns[0].gameFormulas.sort(), [
  "[ราคา] * 0.1",
  "[ราคา] * 0.9",
]);

// Same file, blank game first: the order rows appear in is the order games are
// built in, and it must not decide whose formula survives.
const blankFirst = plan([
  { ...pack, game_id: "1", "กำไร": "" },
  { ...pack, game_id: "1", pack_name: "120 Gems", "กำไร": "" },
  { ...pack, game_id: "3", "กำไร": "[ราคา] * 0.1" },
  { ...pack, game_id: "3", pack_name: "120 Gems", "กำไร": "[ราคา] * 0.1" },
]);
check("(c) the row order does not decide whose formula survives", byGame(blankFirst)[3].gameFormula, "[ราคา] * 0.1");
check("(c) and the blank game states nothing", byGame(blankFirst)[1].gameFormula, "");
// A column any game has a rule for is a formula column, not a manual one:
// there is one entry mode for every game because there is one definition.
check(
  "(c) every game agrees on the entry mode",
  [...new Set(blankFirst.games.map((game) => game.columns[0].entryMode))],
  ["formula"]
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
