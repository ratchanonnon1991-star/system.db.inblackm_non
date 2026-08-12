// parseSelectAliases: reading the real column name straight out of the SELECT
// list ("column AS \"alias\"") instead of guessing it against a live schema.
import { parseSelectAliases } from "@/lib/gamedb-sql-params.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const sql = `
SELECT
    id,
    rpad(repeat('★', rank_stars), 3, '') AS "Rank",
    bot_manual,
    channel AS "ช่องทางการเติม",
    region,
    vpn AS "VPN / NO VPN",
    game AS "GAME",
    is_repeatable AS "ซ้ำ/ไม่ซ้ำ",
    link AS "LINK",
    platform AS "Platform",
    server AS "Server",
    remark AS "หมายเหตุ"
FROM game_list
ORDER BY rank_stars DESC, id ASC
`;
const map = parseSelectAliases(sql);

check(
  "a Thai alias with slashes maps back to the real column",
  map["ซ้ำ/ไม่ซ้ำ"],
  "is_repeatable"
);
check("a Thai alias with spaces maps back too", map["VPN / NO VPN"], "vpn");
check("an ordinary aliased column maps back", map["ช่องทางการเติม"], "channel");
check("a column with no alias is not in the map", "id" in map, false);
check(
  "a function-call item (rpad/repeat) is not mistaken for a plain column",
  map["Rank"],
  undefined
);

check(
  "a table-qualified column keeps only the column part",
  parseSelectAliases(`SELECT g.name AS "Name" FROM games g`).Name,
  "name"
);

check("no SELECT at all yields an empty map", parseSelectAliases("not sql"), {});
check("no FROM at all yields an empty map", parseSelectAliases("SELECT 1"), {});

check(
  "a comma inside a function call in the list does not split the item",
  parseSelectAliases(`SELECT concat(a, b) AS "X", c AS "Y" FROM t`).Y,
  "c"
);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
