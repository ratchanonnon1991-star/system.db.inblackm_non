import { createGameListRows, listGameListRows } from "@/server/gameinfo-gamelist.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const input = (game) => ({
  game,
  region: "TH",
  platform: "Mobile",
  server: "Asia",
  vpn: "NO VPN",
  channel: "",
  rankStars: 2,
  botManual: "Manual",
  isRepeatable: false,
  link: "",
  remark: "",
});

async function run() {
  // Warm the per-connection order side-table cache before statement asserts.
  reset();
  await listGameListRows();

  reset();
  let nextId = 10;
  setResponder((text, params) => {
    if (/^INSERT INTO game_list/.test(text)) {
      return {
        rows: [
          {
            id: nextId++,
            game: params[0],
            region: params[1],
            platform: params[2],
            server: params[3],
            bot_manual: params[4],
            link: params[5],
            channel: params[6],
          },
        ],
      };
    }
    return null;
  });

  const created = await createGameListRows([input("A"), input("B")]);
  const statements = log.filter((entry) => entry.text !== "RELEASE").map((entry) => entry.text.trim());
  check("bulk create: wraps every insert in one transaction", [statements[0], statements.at(-1)], ["BEGIN", "COMMIT"]);
  check("bulk create: inserts every CSV game", created.map((row) => row.game), ["A", "B"]);
  check(
    "bulk create: binds values instead of interpolating them",
    log.filter((entry) => /^INSERT INTO game_list/.test(entry.text)).map((entry) => entry.params[0]),
    ["A", "B"]
  );
  const bulkInsert = log.find((entry) => /^INSERT INTO game_list/.test(entry.text));
  check(
    "bulk create: CSV cannot write hidden game_list fields",
    [
      /rank_stars|is_repeatable|remark|vpn/.test(bulkInsert.text),
      bulkInsert.params.length,
    ],
    [false, 7]
  );

  reset({ fail: "insert failed" });
  let failed = false;
  try {
    await createGameListRows([input("C")]);
  } catch {
    failed = true;
  }
  check("bulk create: surfaces an insert failure", failed, true);
  check("bulk create: rolls back the whole batch on failure", log.some((entry) => entry.text === "ROLLBACK"), true);

  console.log(`\n${pass} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  process.exit(failures.length ? 1 : 0);
}

run();
