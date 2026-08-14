// gameinfo-gamelist-packs.js against the recording @/lib/db stub (fed a fake
// "gameinfo" connection via the connections-repository stub) — asserts the
// currencies<->gamelist_packs round trip (ported from the old
// gameinfo-games.js/game_packs suite, now that games/game_packs itself is
// gone and gamelist_packs is the only pack storage left), the computed-column
// sentinel row, and the list-table pack-count/cross-game-channel aggregate
// lookups.
import {
  deleteGamelistPacksForGame,
  getGamelistPacks,
  importGamelistPacks,
  listAllGamelistChannels,
  listGamelistPackCountByGame,
  saveGamelistPacks,
} from "@/server/gameinfo-gamelist-packs.js";
import { log, reset, setResponder } from "@/lib/db.js";

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

const statements = () => log.filter((entry) => entry.text !== "RELEASE").map((e) => e.text.trim());
const find = (pattern) => log.find((entry) => pattern.test(entry.text));

const ORIGINAL_TREE = [
  {
    id: "c1",
    name: "Diamonds",
    image: "",
    categories: [
      {
        id: "cat1",
        name: "Starter",
        packs: [
          {
            id: "pk1",
            name: "Pack A",
            image: "",
            price: "10",
            amountCharged: "",
            amountChargedFee: "12",
            channelsMain: ["Wave"],
            channelsSecondary: [],
            country: "",
          },
          {
            id: "pk2",
            name: "Pack B",
            image: "",
            price: "20",
            amountCharged: "",
            amountChargedFee: "22",
            channelsMain: ["Wave"],
            channelsSecondary: [],
            country: "",
          },
        ],
      },
    ],
  },
];

async function run() {
  // Warm-up: CREATE TABLE IF NOT EXISTS is cached per connection id and only
  // issued once per process, so get it out of the way before asserting on
  // the log for the calls that follow.
  reset();
  await getGamelistPacks(1);

  // --- saveGamelistPacks: replaces every row for this game in one transaction
  reset();
  const computedColumns = [{ key: "col_1", label: "กำไร", formula: "[ราคา]*1.1", type: "number" }];
  await saveGamelistPacks(5, { currencies: ORIGINAL_TREE, computedColumns });

  const saveStmts = statements();
  check(
    "save: wraps the whole replace in a transaction",
    [saveStmts[0], saveStmts.includes("COMMIT")],
    ["BEGIN", true]
  );

  const deleteStmt = find(/^DELETE FROM gamelist_packs WHERE game_id = \$1/);
  ok("save: clears this game's old rows before reinserting", Boolean(deleteStmt));
  check("save: deletes by game id", deleteStmt?.params, [5]);

  const packInserts = log.filter(
    (e) => /^INSERT INTO gamelist_packs/.test(e.text) && e.params?.[1] !== "__computed__"
  );
  check("save: inserts one row per pack", packInserts.length, 2);
  check(
    "save: binds game_id then pack_id then data",
    [packInserts[0].params[0], packInserts[0].params[1]],
    [5, "pk1"]
  );
  const firstPackData = JSON.parse(packInserts[0].params[2]);
  check(
    "save: data carries the currency/category the pack belongs to",
    [firstPackData.currencyId, firstPackData.categoryId],
    ["c1", "cat1"]
  );
  check("save: data keeps this pack's position for reconstruction", firstPackData.packOrder, 0);
  check("save: the second pack keeps its own position", JSON.parse(packInserts[1].params[2]).packOrder, 1);

  const sentinelInsert = log.find(
    (e) => /^INSERT INTO gamelist_packs/.test(e.text) && e.params?.[1] === "__computed__"
  );
  ok("save: writes a __computed__ sentinel row for computed columns", Boolean(sentinelInsert));
  check(
    "save: sentinel data stores the computed columns array",
    JSON.parse(sentinelInsert.params[2]).columns,
    computedColumns
  );

  // --- getGamelistPacks: round-trips the tree + computed columns back out ---
  reset();
  setResponder((text) => {
    if (/^SELECT game_id, pack_id, data FROM gamelist_packs WHERE game_id = \$1/.test(text)) {
      return {
        rows: [
          ...packInserts.map((e) => ({ game_id: e.params[0], pack_id: e.params[1], data: JSON.parse(e.params[2]) })),
          { game_id: 5, pack_id: "__computed__", data: JSON.parse(sentinelInsert.params[2]) },
        ],
      };
    }
    return null;
  });
  const loaded = await getGamelistPacks(5);
  check("round-trip: reconstructs the original currency/category/pack tree", loaded.currencies, ORIGINAL_TREE);
  check("round-trip: reconstructs the computed columns", loaded.computedColumns, computedColumns);
  check("round-trip: defaults the sheet column order", loaded.columnOrder, []);

  reset();
  setResponder(() => ({ rows: [] }));
  const empty = await getGamelistPacks(5);
  check("empty: no rows gives an empty tree and no computed columns", empty, {
    currencies: [],
    computedColumns: [],
    columnOrder: [],
  });

  // --- listGamelistPackCountByGame: excludes the __computed__ sentinel ------
  reset();
  setResponder((text) => {
    if (/^SELECT game_id, COUNT\(\*\)::int AS pack_count FROM gamelist_packs/.test(text)) {
      return { rows: [{ game_id: 5, pack_count: 2 }, { game_id: 7, pack_count: 1 }] };
    }
    return null;
  });
  const counts = await listGamelistPackCountByGame();
  check("pack count: maps game_id to its count", counts, { 5: 2, 7: 1 });
  const countStmt = find(/^SELECT game_id, COUNT\(\*\)::int AS pack_count FROM gamelist_packs/);
  ok("pack count: excludes the computed sentinel", countStmt && /pack_id != \$1/.test(countStmt.text));
  check("pack count: binds the sentinel value", countStmt?.params, ["__computed__"]);

  // --- importGamelistPacks: multi-game replace in one transaction --------
  reset();
  setResponder((text, params) => {
    if (/^SELECT id FROM game_list WHERE id = \$1 FOR UPDATE/.test(text)) {
      return { rows: [{ id: params[0] }] };
    }
    return null;
  });
  await importGamelistPacks(
    [
      { gameId: 5, currencies: ORIGINAL_TREE, packCount: 2 },
      { gameId: 7, currencies: [], packCount: 0 },
    ],
    "replace"
  );
  const bulkStmts = statements();
  check("bulk import: uses one transaction for every game", [bulkStmts[0], bulkStmts.at(-1)], ["BEGIN", "COMMIT"]);
  check(
    "bulk import: locks and re-checks every target game",
    log.filter((entry) => /^SELECT id FROM game_list WHERE id = \$1 FOR UPDATE/.test(entry.text)).map((entry) => entry.params),
    [[5], [7]]
  );
  check(
    "bulk import: replaces real packs for both games",
    log.filter((entry) => /^DELETE FROM gamelist_packs WHERE game_id = \$1 AND pack_id != \$2/.test(entry.text)).map((entry) => entry.params),
    [[5, "__computed__"], [7, "__computed__"]]
  );
  check(
    "bulk import: preserves computed-column sentinel rows",
    log.some((entry) => /^DELETE FROM gamelist_packs WHERE game_id = \$1$/.test(entry.text.trim())),
    false
  );

  // --- listAllGamelistChannels: merges main+secondary across every game -----
  reset();
  setResponder((text) => {
    if (/^SELECT data FROM gamelist_packs WHERE pack_id != \$1/.test(text)) {
      return {
        rows: [
          { data: { channelsMain: ["Wave", "TrueMoney"], channelsSecondary: ["Shopee"] } },
          { data: { channelsMain: ["TrueMoney"], channelsSecondary: [] } },
        ],
      };
    }
    return null;
  });
  const allChannels = await listAllGamelistChannels();
  check(
    "all channels: dedupes and sorts main+secondary from every game into one flat list",
    allChannels,
    ["Shopee", "TrueMoney", "Wave"]
  );

  // --- deleteGamelistPacksForGame ---------------------------------------------
  reset();
  await deleteGamelistPacksForGame(5);
  const cleanupStmt = find(/^DELETE FROM gamelist_packs WHERE game_id = \$1/);
  ok("cleanup: deletes every row for the game", Boolean(cleanupStmt));
  check("cleanup: binds the game id", cleanupStmt?.params, [5]);

  console.log(`\n${pass} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  process.exit(failures.length ? 1 : 0);
}

run();
