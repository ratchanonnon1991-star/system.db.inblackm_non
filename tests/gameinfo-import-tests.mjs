// CSV row <-> pack tree mapping: tree building, multi-game grouping by
// game_id, single-game parse, merge (add mode), export rows, and an
// export -> parse round-trip.
import {
  buildPackTree,
  gamesToPackRows,
  mergeCurrencies,
  parsePacks,
  parsePacksForGame,
  splitList,
  validatePackRows,
} from "@/lib/gameinfo-import.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}
function ok(name, value) {
  check(name, Boolean(value), true);
}

const packRow = (over = {}) => ({
  game_id: "1",
  game_name: "ML",
  currency_name: "Diamonds",
  currency_image: "",
  category_name: "เติมปกติ",
  pack_name: "86 Diamonds",
  pack_image: "",
  price: "30",
  amount_charged: "100",
  amount_charged_fee: "103",
  channel_main: "A",
  channel_secondary: "",
  country: "",
  ...over,
});

// --- splitList -----------------------------------------------------------
check("splitList splits on comma", splitList("A, B"), ["A", "B"]);
check("splitList splits on ; | and newline too", splitList("A;B|C\nD"), ["A", "B", "C", "D"]);
check("splitList drops empty pieces", splitList("A,,B, "), ["A", "B"]);
check("splitList of blank is empty", splitList(""), []);

// --- buildPackTree -------------------------------------------------------
const tree = buildPackTree([
  packRow({ pack_name: "P1", category_name: "cat1" }),
  packRow({ pack_name: "P2", category_name: "cat1" }),
  packRow({ pack_name: "P3", category_name: "cat2" }),
]);
check("buildPackTree groups into one currency", tree.currencies.length, 1);
check("buildPackTree keeps two categories in order", tree.currencies[0].categories.map((c) => c.name), [
  "cat1",
  "cat2",
]);
check("buildPackTree counts every pack", tree.packCount, 3);
check(
  "buildPackTree puts both packs under the shared category",
  tree.currencies[0].categories[0].packs.map((p) => p.name),
  ["P1", "P2"]
);
check(
  "buildPackTree splits a multi-channel cell into an array",
  buildPackTree([packRow({ channel_main: "A, B" })]).currencies[0].categories[0].packs[0]
    .channelsMain,
  ["A", "B"]
);
check(
  "buildPackTree skips a row with no pack data",
  buildPackTree([packRow({ pack_name: "", price: "", amount_charged: "", amount_charged_fee: "" })])
    .packCount,
  0
);
ok(
  "buildPackTree does not emit a per-pack formulas field",
  !("formulas" in buildPackTree([packRow()]).currencies[0].categories[0].packs[0])
);

// --- parsePacks (multi-game) ---------------------------------------------
const multi = parsePacks([
  packRow({ game_id: "1", pack_name: "A1" }),
  packRow({ game_id: "2", pack_name: "B1" }),
  packRow({ game_id: "1", pack_name: "A2" }),
]);
check("parsePacks groups by game_id keeping first-seen order", multi.perGame.map((g) => g.gameId), [
  1, 2,
]);
check("parsePacks collects a game's rows across the file", multi.perGame[0].packCount, 2);
check("parsePacks reports a row missing game_id", parsePacks([packRow({ game_id: "" })]).errors.length, 1);
check(
  "parsePacks reports an invalid game_id",
  parsePacks([packRow({ game_id: "abc" })]).errors[0].includes("ไม่ถูกต้อง"),
  true
);
check(
  "parsePacks rejects a partially numeric game_id",
  parsePacks([packRow({ game_id: "1abc" })]).errors.length,
  1
);
check(
  "parsePacks ignores a fully blank row silently",
  parsePacks([
    {
      game_id: "",
      game_name: "",
      currency_name: "",
      category_name: "",
      pack_name: "",
      price: "",
      amount_charged: "",
      amount_charged_fee: "",
      channel_main: "",
      channel_secondary: "",
      country: "",
      currency_image: "",
      pack_image: "",
    },
  ]).errors.length,
  0
);

// --- parsePacksForGame (single-game, ignores game_id column) -------------
const single = parsePacksForGame(
  [packRow({ game_id: "999", pack_name: "X" }), packRow({ game_id: "888", pack_name: "Y" })],
  5,
  "Fallback"
);
check("parsePacksForGame forces every row onto the given game", single.game.gameId, 5);
check("parsePacksForGame ignores the file's game_id split", single.game.packCount, 2);
check("parsePacksForGame ignores game_name and keeps the current game name", single.game.gameName, "Fallback");
check(
  "parsePacksForGame falls back to the passed name when the file has none",
  parsePacksForGame([packRow({ game_name: "" })], 5, "Fallback").game.gameName,
  "Fallback"
);

// --- validatePackRows (bulk import required fields) ----------------------
check("pack validation accepts a complete pack", validatePackRows([packRow()]), []);
check(
  "pack validation reports the same required fields as the editor",
  validatePackRows([packRow({ pack_name: "", price: "", amount_charged_fee: "", channel_main: "" })])[0]
    .includes("pack_name, price, amount_charged_fee, channel_main"),
  true
);
check(
  "pack validation allows an exported empty-game placeholder row",
  validatePackRows([
    packRow({
      currency_name: "",
      category_name: "",
      pack_name: "",
      price: "",
      amount_charged: "",
      amount_charged_fee: "",
      channel_main: "",
    }),
  ]),
  []
);
check(
  "pack validation does not silently ignore a partial channel-only row",
  validatePackRows([
    packRow({ pack_name: "", price: "", amount_charged: "", amount_charged_fee: "", channel_main: "A" }),
  ]).length,
  1
);

// --- mergeCurrencies (add mode) ------------------------------------------
const existing = [
  {
    id: "c1",
    name: "Diamonds",
    image: "",
    categories: [{ id: "cat1", name: "เติมปกติ", packs: [{ id: "p1", name: "old" }] }],
  },
];
const incoming = [
  {
    id: "c2",
    name: "diamonds", // different case — must still match
    image: "",
    categories: [
      { id: "cat2", name: "เติมปกติ", packs: [{ id: "p2", name: "new" }] },
      { id: "cat3", name: "Pass", packs: [{ id: "p3", name: "passpack" }] },
    ],
  },
];
const merged = mergeCurrencies(existing, incoming);
check("merge matches currency by case-insensitive name (no duplicate)", merged.length, 1);
check(
  "merge appends the incoming pack onto the matched category",
  merged[0].categories[0].packs.map((p) => p.name),
  ["old", "new"]
);
check(
  "merge appends an unmatched category whole",
  merged[0].categories.map((c) => c.name),
  ["เติมปกติ", "Pass"]
);
check("merge does not mutate the existing tree", existing[0].categories[0].packs.length, 1);
check(
  "merge appends an unmatched currency whole",
  mergeCurrencies(existing, [{ id: "c9", name: "Gold", image: "", categories: [] }]).length,
  2
);

// --- gamesToPackRows + round-trip ----------------------------------------
const games = [
  {
    id: 7,
    gameName: "ML",
    currencies: [
      {
        id: "c1",
        name: "Diamonds",
        image: "",
        categories: [
          {
            id: "cat1",
            name: "เติมปกติ",
            packs: [
              {
                id: "p1",
                name: "86",
                image: "",
                price: "30",
                amountCharged: "100",
                amountChargedFee: "103",
                channelsMain: ["A", "B"],
                channelsSecondary: [],
                country: "",
              },
            ],
          },
        ],
      },
    ],
  },
  { id: 8, gameName: "Empty", currencies: [] },
];
const exported = gamesToPackRows(games);
check("export emits one row per pack", exported.filter((r) => r.pack_name).length, 1);
check("export still emits a blank-pack row for a game with no packs", exported.length, 2);
check("export joins channels with a comma", exported[0].channel_main, "A, B");

const reparsed = parsePacks(exported);
// Both games are recovered — game 8's blank-pack row keeps it addressable on
// re-import (with 0 packs), which is the point of emitting that row.
check("round-trip: exporting then parsing recovers every game id", reparsed.perGame.map((g) => g.gameId), [
  7, 8,
]);
check("round-trip: the empty game comes back with no packs", reparsed.perGame[1].packCount, 0);
check(
  "round-trip: the pack survives export -> parse",
  reparsed.perGame[0].currencies[0].categories[0].packs[0].channelsMain,
  ["A", "B"]
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
