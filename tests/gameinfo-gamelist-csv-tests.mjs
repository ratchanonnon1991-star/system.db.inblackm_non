import {
  gameListRowsToCsvRows,
  parseGameListCsvRows,
} from "@/lib/gameinfo-gamelist-csv.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const parsed = parseGameListCsvRows(
  [
    { game: "New Game", region: "TH", bot_manual: "Manual" },
    { game: "new game" },
    { game: "", region: "TH" },
    { game: "Existing" },
  ],
  ["Existing"]
);
check("gamelist CSV keeps only new valid games", parsed.rows, [
  { game: "New Game", region: "TH", platform: "", server: "", botManual: "Manual", link: "" },
]);
check("gamelist CSV reports duplicate and missing names", parsed.errors.length, 3);
check(
  "gamelist export emits stable IDs and displayed fields",
  gameListRowsToCsvRows([{ id: 7, game: "G", region: "Global", botManual: "Bot" }]),
  [{ id: "7", game: "G", region: "Global", platform: "", server: "", bot_manual: "Bot", link: "" }]
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
