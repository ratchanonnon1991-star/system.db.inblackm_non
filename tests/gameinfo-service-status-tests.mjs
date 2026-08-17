import {
  listGameListRows,
  setGameListServiceStatus,
} from "@/server/gameinfo-gamelist.js";
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

reset();
setResponder((text) => {
  if (/SELECT g\.\*, o\.sort_order/.test(text)) {
    return {
      rows: [{
        id: 5,
        game: "Game A",
        region: "Global",
        platform: null,
        server: null,
        vpn: "NO VPN",
        channel: "",
        rank_stars: 0,
        bot_manual: "Manual",
        is_repeatable: false,
        link: null,
        remark: null,
        service_enabled: false,
        service_new: false,
      }, {
        id: 7,
        game: "Game New",
        region: "Global",
        service_enabled: true,
        service_new: true,
      }],
    };
  }
  return null;
});
const rows = await listGameListRows();
check("list maps a disabled game service status", rows[0].serviceEnabled, false);
check("list maps the red new-game status", rows[1].serviceNew, true);
ok("list joins the side-table without altering game_list", log.some((entry) => /LEFT JOIN gamelist_service_status/.test(entry.text)));

reset();
setResponder((text) => {
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 5 }, { id: 7 }] };
  return null;
});
check(
  "bulk status normalizes duplicate ids",
  await setGameListServiceStatus([5, 7, 5], false),
  { gameIds: [5, 7], enabled: false, isNew: false }
);
check(
  "bulk status writes one upsert per selected game",
  log.filter((entry) => /INSERT INTO gamelist_service_status/.test(entry.text)).map((entry) => entry.params),
  [[5, false, false], [7, false, false]]
);
ok("bulk status locks selected game rows", log.some((entry) => /FOR UPDATE/.test(entry.text)));
ok("bulk status commits atomically", log.some((entry) => entry.text.trim() === "COMMIT"));

reset();
setResponder((text) => {
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 5 }] };
  return null;
});
let missingError = null;
try {
  await setGameListServiceStatus([5, 999], true);
} catch (error) {
  missingError = error;
}
check("bulk status rejects when any selected game is missing", missingError?.status, 404);
ok("bulk status rolls back the whole selection", log.some((entry) => entry.text.trim() === "ROLLBACK"));
check(
  "bulk status performs no upsert before validating the full selection",
  log.filter((entry) => /INSERT INTO gamelist_service_status/.test(entry.text)).length,
  0
);

reset();
setResponder((text) => {
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 7 }] };
  return null;
});
check(
  "new status always keeps the game enabled",
  await setGameListServiceStatus([7], false, true),
  { gameIds: [7], enabled: true, isNew: true }
);
check(
  "new status is persisted in the service side table",
  log.find((entry) => /INSERT INTO gamelist_service_status/.test(entry.text))?.params,
  [7, true, true]
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
