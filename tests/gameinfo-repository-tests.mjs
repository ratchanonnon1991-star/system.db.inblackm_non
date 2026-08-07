// gameinfo-games.js against the recording @/lib/db stub (fed a fake
// "gameinfo" connection via the connections-repository stub) — asserts the
// SQL actually generated, especially that the reserved word "order" is
// quoted everywhere it is referenced, and that packs round-trip correctly
// through the game_packs table (game_id + pack_id as the only real columns,
// everything else about a pack carried in the `data` JSON column).
import {
  createGameinfoGame,
  deleteGameinfoGame,
  flattenCurrencies,
  getGameinfoGame,
  listGameinfoGames,
  reconstructCurrencies,
  reorderGameinfoGames,
  saveGameinfoPacks,
  updateGameinfoGame,
} from "@/server/gameinfo-games.js";
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

const SAMPLE_GAME_ROW = {
  id: 5,
  order: 0,
  game_name: "Mobile Legends",
  region: "Global",
  vpn: "NO",
  web_topup: "",
  platform: "",
  server: "",
  image: "",
  computed_column: null,
};

async function run() {
  // Warm-up: the CREATE TABLE IF NOT EXISTS x2 is cached per connection id
  // and only issued once per process, so get it out of the way before
  // asserting on the log for the calls that follow.
  reset();
  await listGameinfoGames();

  // --- reconstructCurrencies / flattenCurrencies round-trip ----------------
  const originalTree = [
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
  const flatRows = flattenCurrencies(5, originalTree);
  check("flatten: one row per pack", flatRows.length, 2);
  check("flatten: carries game_id on every row", flatRows.every((r) => r.gameId === 5), true);
  check(
    "flatten: pack keeps its own id",
    [flatRows[0].packId, flatRows[1].packId],
    ["pk1", "pk2"]
  );
  check(
    "flatten: pack data records which currency/category it belongs to",
    [flatRows[0].data.currencyId, flatRows[0].data.categoryId],
    ["c1", "cat1"]
  );
  const packRowsForReconstruct = flatRows.map((r) => ({
    game_id: r.gameId,
    pack_id: r.packId,
    data: r.data,
  }));
  check(
    "round-trip: flatten then reconstruct gives back the same tree",
    reconstructCurrencies(packRowsForReconstruct),
    originalTree
  );
  check("reconstruct: no packs gives an empty tree", reconstructCurrencies([]), []);

  // --- listGameinfoGames -----------------------------------------------
  reset();
  setResponder((text) => {
    if (/^SELECT \* FROM games/.test(text)) return { rows: [SAMPLE_GAME_ROW] };
    if (/FROM game_packs WHERE game_id = ANY/.test(text)) return { rows: [] };
    return null;
  });
  const games = await listGameinfoGames();
  ok(
    "list: orders by the quoted order column",
    statements().some((s) => /ORDER BY "order" ASC, id ASC/.test(s))
  );
  ok(
    "list: looks up packs for every listed game in one query",
    find(/FROM game_packs WHERE game_id = ANY/)
  );
  check("list: maps a game with no packs to an empty currencies array", games[0].currencies, []);
  check("list: maps game_name to gameName", games[0].gameName, "Mobile Legends");

  // --- getGameinfoGame ----------------------------------------------------
  reset();
  setResponder((text) => {
    if (/^SELECT \* FROM games WHERE id = \$1/.test(text)) return { rows: [SAMPLE_GAME_ROW] };
    if (/FROM game_packs WHERE game_id = \$1/.test(text)) return { rows: [] };
    return null;
  });
  await getGameinfoGame(5);
  ok("get: selects the game by id", find(/^SELECT \* FROM games WHERE id = \$1/));
  ok("get: fetches that game's packs separately", find(/FROM game_packs WHERE game_id = \$1/));

  // --- createGameinfoGame --------------------------------------------------
  reset();
  setResponder((text) => {
    if (/SELECT COALESCE\(MAX\("order"\)/.test(text)) return { rows: [{ next: 5 }] };
    if (/^INSERT INTO games/.test(text)) return { rows: [{ id: 9, order: 5 }] };
    return null;
  });
  await createGameinfoGame({ gameName: "New Game", vpn: "YES" });
  ok(
    "create: reads the next order with the column quoted",
    find(/SELECT COALESCE\(MAX\("order"\), 0\) \+ 1 AS next FROM games/)
  );
  const insertGameStmt = find(/^INSERT INTO games/);
  ok("create: inserts with a quoted order column", insertGameStmt && /"order"/.test(insertGameStmt.text));
  check("create: binds the computed next order last", insertGameStmt?.params?.[7], 5);
  check("create: normalizes vpn to YES/NO", insertGameStmt?.params?.[2], "YES");

  // --- updateGameinfoGame ---------------------------------------------------
  reset();
  setResponder(() => ({ rows: [SAMPLE_GAME_ROW] }));
  await updateGameinfoGame(1, { gameName: "Renamed", vpn: "bogus" });
  const updateStmt = find(/^UPDATE games SET/);
  ok("update: only sets the provided columns", updateStmt && /game_name = \$1, vpn = \$2/.test(updateStmt.text));
  ok("update: touches updated_at", /updated_at = NOW\(\)/.test(updateStmt.text));
  check("update: normalizes an invalid vpn value to NO", updateStmt?.params?.[1], "NO");
  check("update: binds the id last", updateStmt?.params?.[2], 1);

  // --- deleteGameinfoGame ---------------------------------------------------
  reset();
  await deleteGameinfoGame(4);
  const deleteGameStmt = find(/^DELETE FROM games/);
  ok("delete: deletes the game by id", deleteGameStmt && /WHERE id = \$1/.test(deleteGameStmt.text));
  check("delete: binds the id", deleteGameStmt?.params, [4]);

  // --- reorderGameinfoGames --------------------------------------------------
  reset();
  await reorderGameinfoGames([30, 10, 20]);
  const reorderStmts = statements();
  check(
    "reorder: wraps in a transaction",
    [reorderStmts[0], reorderStmts[reorderStmts.length - 1]],
    ["BEGIN", "COMMIT"]
  );
  const orderUpdates = log.filter((e) => /^UPDATE games SET "order"/.test(e.text));
  check("reorder: writes one UPDATE per id", orderUpdates.length, 3);
  ok("reorder: quotes the order column being set", orderUpdates.every((e) => /SET "order" = \$1/.test(e.text)));
  check("reorder: binds position and id in the order given", orderUpdates[1].params, [1, 10]);

  // --- saveGameinfoPacks: replaces every game_packs row in one transaction --
  reset();
  setResponder((text) => {
    if (/^SELECT \* FROM games WHERE id = \$1/.test(text)) return { rows: [SAMPLE_GAME_ROW] };
    if (/FROM game_packs WHERE game_id = \$1/.test(text)) return { rows: [] };
    return null;
  });
  const computedColumns = [{ key: "col_1", label: "กำไร", formula: "[ราคา]*1.1", type: "number" }];
  await saveGameinfoPacks(5, { currencies: originalTree, computedColumns });

  const saveStmts = statements();
  check(
    "packs: wraps the whole replace in a transaction",
    [saveStmts[0], saveStmts.includes("COMMIT")],
    ["BEGIN", true]
  );
  const computedStmt = find(/^UPDATE games SET computed_column/);
  ok("packs: updates computed_column on the game row", Boolean(computedStmt));
  check("packs: stores computedColumns as JSON", computedStmt?.params?.[0], JSON.stringify(computedColumns));
  check("packs: computed_column update is scoped to this game", computedStmt?.params?.[1], 5);

  const deletePacksStmt = find(/^DELETE FROM game_packs WHERE game_id = \$1/);
  ok("packs: clears this game's old pack rows before reinserting", Boolean(deletePacksStmt));
  check("packs: deletes by game id", deletePacksStmt?.params, [5]);

  const insertPackStmts = log.filter((e) => /^INSERT INTO game_packs/.test(e.text));
  check("packs: inserts one row per pack", insertPackStmts.length, 2);
  check(
    "packs: binds game_id then pack_id then data",
    [insertPackStmts[0].params[0], insertPackStmts[0].params[1]],
    [5, "pk1"]
  );
  const firstPackData = JSON.parse(insertPackStmts[0].params[2]);
  check(
    "packs: data carries the currency/category the pack belongs to",
    [firstPackData.currencyId, firstPackData.categoryId],
    ["c1", "cat1"]
  );
  check("packs: data keeps this pack's position for reconstruction", firstPackData.packOrder, 0);
  check(
    "packs: the second pack keeps its own position",
    JSON.parse(insertPackStmts[1].params[2]).packOrder,
    1
  );

  console.log(`\n${pass} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  process.exit(failures.length ? 1 : 0);
}

run();
