import {
  filterGameinfoColumnsForRole,
  hiddenGameinfoColumnKeys,
} from "@/lib/gameinfo-column-roles.js";
import { buildGameinfoPackColumns } from "@/lib/gameinfo-pack-columns.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}
const keys = (set) => [...set].sort();

// --- no rules -------------------------------------------------------------
check("a column nobody ruled on is visible", keys(hiddenGameinfoColumnKeys([], "topup", 3)), []);
check(
  "a rule that shows a column hides nothing",
  keys(hiddenGameinfoColumnKeys([{ role: "topup", gameId: 0, columnKey: "cost", visible: true }], "topup", 3)),
  []
);

// --- the every-game rule --------------------------------------------------
const global = [{ role: "topup", gameId: 0, columnKey: "cost", visible: false }];
check("an every-game rule applies to any game", keys(hiddenGameinfoColumnKeys(global, "topup", 3)), ["cost"]);
check("and to a game it has never seen", keys(hiddenGameinfoColumnKeys(global, "topup", 99)), ["cost"]);
check("but only to the role it names", keys(hiddenGameinfoColumnKeys(global, "admin", 3)), []);

// --- one game overriding it ----------------------------------------------
const overridden = [
  { role: "topup", gameId: 0, columnKey: "cost", visible: false },
  { role: "topup", gameId: 3, columnKey: "cost", visible: true },
];
check("a game can show what every other game hides", keys(hiddenGameinfoColumnKeys(overridden, "topup", 3)), []);
check("without changing the other games", keys(hiddenGameinfoColumnKeys(overridden, "topup", 4)), ["cost"]);

const narrowed = [
  { role: "topup", gameId: 0, columnKey: "cost", visible: true },
  { role: "topup", gameId: 3, columnKey: "cost", visible: false },
];
check("and a game can hide what every other game shows", keys(hiddenGameinfoColumnKeys(narrowed, "topup", 3)), ["cost"]);
check("again without touching the others", keys(hiddenGameinfoColumnKeys(narrowed, "topup", 4)), []);

// A rule for some *other* game must not leak into this one.
check(
  "another game's rule stays in that game",
  keys(hiddenGameinfoColumnKeys([{ role: "topup", gameId: 4, columnKey: "cost", visible: false }], "topup", 3)),
  []
);

check(
  "several columns can be hidden at once",
  keys(
    hiddenGameinfoColumnKeys(
      [
        { role: "topup", gameId: 0, columnKey: "cost", visible: false },
        { role: "topup", gameId: 0, columnKey: "profit", visible: false },
      ],
      "topup",
      3
    )
  ),
  ["cost", "profit"]
);

// --- applying it to the table --------------------------------------------
const columns = buildGameinfoPackColumns([
  { key: "cost", label: "ต้นทุน", formula: "1" },
  { key: "profit", label: "กำไร", formula: "1" },
]);
const shown = filterGameinfoColumnsForRole(columns, new Set(["cost"]));
check("a hidden column leaves the table", shown.some((column) => column.id === "computed:cost"), false);
check("the others stay", shown.some((column) => column.id === "computed:profit"), true);
check("with no rules the table is untouched", filterGameinfoColumnsForRole(columns, new Set()).length, columns.length);

// Built-in columns are the pack itself — a table with no price is not a table.
check(
  "a rule cannot hide a built-in column",
  filterGameinfoColumnsForRole(columns, new Set(["price", "name"])).some((column) => column.id === "price"),
  true
);
check(
  "and never the pinned status column",
  filterGameinfoColumnsForRole(columns, new Set(["serviceEnabled"]))[0].id,
  "serviceEnabled"
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
