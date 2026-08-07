// gameinfo-games.js against the recording @/lib/db stub (fed a fake
// "gameinfo" connection via the connections-repository stub) — asserts the
// SQL actually generated, especially that the reserved word "order" is
// quoted everywhere it is referenced by name.
import {
  createGameinfoGame,
  deleteGameinfoGame,
  getGameinfoGame,
  listGameinfoGames,
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

async function run() {
  // Warm-up: the CREATE TABLE IF NOT EXISTS is cached per connection id and
  // only issued once per process, so get it out of the way before asserting
  // on the log for the calls that follow.
  reset();
  await listGameinfoGames();

  // --- listGameinfoGames -----------------------------------------------
  reset({
    rows: [
      {
        id: 1,
        order: 0,
        game_name: "Mobile Legends",
        region: "Global",
        vpn: "NO",
        web_topup: "",
        platform: "",
        server: "",
        image: "",
        currencies: [],
        computed_column: null,
      },
    ],
  });
  const games = await listGameinfoGames();
  ok(
    "list: orders by the quoted order column",
    statements().some((s) => /ORDER BY "order" ASC, id ASC/.test(s))
  );
  check("list: maps a missing computed_column to an empty array", games[0].computedColumns, []);
  check("list: maps game_name to gameName", games[0].gameName, "Mobile Legends");

  // --- getGameinfoGame ----------------------------------------------------
  reset({ rows: [] });
  await getGameinfoGame(7);
  ok("get: selects by id", find(/^SELECT \* FROM games WHERE id = \$1/));
  check("get: binds the id", log.find((e) => /WHERE id = \$1/.test(e.text))?.params, [7]);

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
  const insertStmt = find(/^INSERT INTO games/);
  ok("create: inserts with a quoted order column", insertStmt && /"order"/.test(insertStmt.text));
  check("create: binds the computed next order last", insertStmt?.params?.[7], 5);
  check("create: normalizes vpn to YES/NO", insertStmt?.params?.[2], "YES");

  // --- updateGameinfoGame ---------------------------------------------------
  reset();
  setResponder(() => ({ rows: [{ id: 1, order: 0 }] }));
  await updateGameinfoGame(1, { gameName: "Renamed", vpn: "bogus" });
  const updateStmt = find(/^UPDATE games SET/);
  ok("update: only sets the provided columns", updateStmt && /game_name = \$1, vpn = \$2/.test(updateStmt.text));
  ok("update: touches updated_at", /updated_at = NOW\(\)/.test(updateStmt.text));
  check("update: normalizes an invalid vpn value to NO", updateStmt?.params?.[1], "NO");
  check("update: binds the id last", updateStmt?.params?.[2], 1);

  // --- deleteGameinfoGame ---------------------------------------------------
  reset();
  await deleteGameinfoGame(4);
  const deleteStmt = find(/^DELETE FROM games/);
  ok("delete: deletes by id", deleteStmt && /WHERE id = \$1/.test(deleteStmt.text));
  check("delete: binds the id", deleteStmt?.params, [4]);

  // --- reorderGameinfoGames --------------------------------------------------
  reset();
  await reorderGameinfoGames([30, 10, 20]);
  const stmts = statements();
  check("reorder: wraps in a transaction", [stmts[0], stmts[stmts.length - 1]], ["BEGIN", "COMMIT"]);
  const orderUpdates = log.filter((e) => /^UPDATE games SET "order"/.test(e.text));
  check("reorder: writes one UPDATE per id", orderUpdates.length, 3);
  ok("reorder: quotes the order column being set", orderUpdates.every((e) => /SET "order" = \$1/.test(e.text)));
  check("reorder: binds position and id in the order given", orderUpdates[1].params, [1, 10]);

  // --- saveGameinfoPacks -----------------------------------------------------
  reset();
  setResponder(() => ({ rows: [{ id: 1 }] }));
  const currencies = [{ id: "c1", name: "Diamonds", categories: [] }];
  const computedColumns = [{ key: "col_1", label: "กำไร", formula: "[ราคา]*1.1", type: "number" }];
  await saveGameinfoPacks(1, { currencies, computedColumns });
  const packsStmt = find(/^UPDATE games\s+SET currencies/);
  ok("packs: updates currencies and computed_column together", Boolean(packsStmt));
  check("packs: stores currencies as JSON", packsStmt?.params?.[0], JSON.stringify(currencies));
  check("packs: stores computedColumns as JSON", packsStmt?.params?.[1], JSON.stringify(computedColumns));

  console.log(`\n${pass} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  process.exit(failures.length ? 1 : 0);
}

run();
