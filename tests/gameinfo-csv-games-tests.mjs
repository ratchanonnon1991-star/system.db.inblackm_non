import {
  confirmedGameinfoCsvGames,
  resolveGameinfoCsvGames,
} from "@/lib/gameinfo-csv-games.js";

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
  { id: 22, game: "GODDESS OF VICTORY: NIKKE UID" },
  { id: 1, game: "HONKAI IMPACT" },
];
const pack = { pack_name: "A", price: "100", amount_charged_fee: "90" };

// --- game_id, the way it has always worked -------------------------------
const byId = resolveGameinfoCsvGames([{ ...pack, game_id: "3" }], games);
check("a row with a known game_id lands in that game", byId.existing.map((g) => g.gameId), [3]);
check("a row with a known game_id creates nothing", byId.created, []);
check("a row with a known game_id is not an error", byId.errors, []);

check(
  "an unknown game_id is refused",
  resolveGameinfoCsvGames([{ ...pack, game_id: "999" }], games).errors,
  ["แถวที่ 2: ไม่พบเกม game_id 999"]
);
check(
  "a game_id that is not a number is refused",
  resolveGameinfoCsvGames([{ ...pack, game_id: "abc" }], games).errors,
  ['แถวที่ 2: game_id "abc" ไม่ถูกต้อง']
);

// --- no game_id ----------------------------------------------------------
const byName = resolveGameinfoCsvGames([{ ...pack, game_name: "LOVE AND DEEPSPACE" }], games);
check("an exact name fills in the game it names", byName.existing.map((g) => g.gameId), [3]);
check("an exact name creates nothing", byName.created, []);
check("matching by name is recorded", byName.existing[0].matchedByName, true);
check(
  "case and spacing do not stop a name matching",
  resolveGameinfoCsvGames([{ ...pack, game_name: "  love and deepspace " }], games).existing.map((g) => g.gameId),
  [3]
);

const fresh = resolveGameinfoCsvGames([{ ...pack, game_name: "VALORANT MOBILE" }], games);
check("an unrecognised name proposes a new game", fresh.created.map((g) => g.gameName), ["VALORANT MOBILE"]);
check("a proposed game carries its rows", fresh.created[0].rows.length, 1);
check("a clearly new name raises no warning", fresh.warnings, []);
check("proposing a game is not an error", fresh.errors, []);

const typo = resolveGameinfoCsvGames([{ ...pack, game_name: "HONKAI IMPAC" }], games);
check("a near-miss name still proposes a game", typo.created.length, 1);
check("a near-miss name is flagged for a second look", typo.created[0].similar, ["HONKAI IMPACT"]);
check("the warning names both games", typo.warnings.length, 1);
check(
  "the warning asks rather than decides",
  typo.warnings[0].includes("HONKAI IMPAC") && typo.warnings[0].includes("เกมเดียวกันหรือเปล่า"),
  true
);

check(
  "a row identifying no game at all is refused",
  resolveGameinfoCsvGames([{ ...pack }], games).errors,
  ["แถวที่ 2: ไม่มีทั้ง game_id และ game_name จึงไม่รู้ว่าเป็นเกมไหน"]
);
check("a blank row is ignored rather than refused", resolveGameinfoCsvGames([{}], games).errors, []);

// --- grouping ------------------------------------------------------------
const grouped = resolveGameinfoCsvGames(
  [
    { ...pack, game_name: "VALORANT MOBILE" },
    { ...pack, pack_name: "B", game_name: "valorant mobile" },
    { ...pack, pack_name: "C", game_id: "3" },
    { ...pack, pack_name: "D", game_name: "LOVE AND DEEPSPACE" },
  ],
  games
);
check("one new game is proposed once, not per row", grouped.created.length, 1);
check("its rows are gathered together", grouped.created[0].rows.length, 2);
check("id and name routes reach the same game", grouped.existing.length, 1);
check("and that game keeps both rows", grouped.existing[0].rows.length, 2);

// Row numbers must point at the spreadsheet, not the parsed array.
check(
  "errors name the spreadsheet line, counting the header",
  resolveGameinfoCsvGames([{ ...pack, game_id: "3" }, { ...pack, game_id: "999" }], games).errors,
  ["แถวที่ 3: ไม่พบเกม game_id 999"]
);

// --- nothing is created without a tick ------------------------------------
const proposed = resolveGameinfoCsvGames(
  [
    { ...pack, game_name: "VALORANT MOBILE" },
    { ...pack, game_name: "HONKAI IMPAC" },
  ],
  games
);
const picked = confirmedGameinfoCsvGames(proposed.created, ["VALORANT MOBILE"]);
check("only the ticked game is created", picked.confirmed.map((g) => g.gameName), ["VALORANT MOBILE"]);
check("the rest are reported as skipped", picked.skipped.map((g) => g.gameName), ["HONKAI IMPAC"]);
check("ticking nothing creates nothing", confirmedGameinfoCsvGames(proposed.created, []).confirmed, []);
check(
  "a tick matches regardless of case",
  confirmedGameinfoCsvGames(proposed.created, ["valorant mobile"]).confirmed.length,
  1
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
