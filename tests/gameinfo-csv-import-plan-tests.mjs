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

function plan(rows, existingColumns = []) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return planGameinfoCsvImport({ headers, rows, existingGames: games, existingColumns });
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

// Countries are normalized on the way in, as they always have been.
const country = plan([{ ...pack, game_id: "3", country: "ไทย" }]);
check("a recognised country is canonicalized", country.games[0].currencies[0].categories[0].packs[0].country, "Thailand");
check(
  "an unrecognised country is reported, not silently kept",
  plan([{ ...pack, game_id: "3", country: "Thailandd" }]).countryIssues.length,
  1
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
