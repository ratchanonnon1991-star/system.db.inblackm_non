import {
  getGamelistLinks,
  legacyGamelistLinks,
  listGamelistLinksByGame,
  normalizeGamelistLinks,
  saveGamelistLinks,
} from "@/server/gameinfo-gamelist-links.js";
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

check("legacy single link becomes a named link", legacyGamelistLinks("https://example.com/topup"), [{
  id: "legacy",
  name: "เว็บเติมเกม",
  url: "https://example.com/topup",
}]);
check("invalid legacy link is ignored safely", legacyGamelistLinks("javascript:alert(1)"), []);

let invalidError = null;
try {
  normalizeGamelistLinks([{ name: "Bad", url: "javascript:alert(1)" }]);
} catch (error) {
  invalidError = error;
}
check("only http and https links are accepted", invalidError?.status, 400);

reset();
setResponder((text) => {
  if (/SELECT data FROM gamelist_links WHERE/.test(text)) return { rows: [] };
  return null;
});
check("missing side-table row is distinguishable from an explicitly empty list", await getGamelistLinks(5), {
  exists: false,
  links: [],
});

reset();
setResponder((text) => {
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 5 }] };
  return null;
});
const saved = await saveGamelistLinks(5, [
  { id: "main", name: "เว็บหลัก", url: "https://example.com/main" },
  { id: "backup", name: "เว็บสำรอง", url: "https://example.com/backup" },
]);
check("multiple named links are saved", saved.map((link) => link.name), ["เว็บหลัก", "เว็บสำรอง"]);
const write = log.find((entry) => /INSERT INTO gamelist_links/.test(entry.text));
check("multiple links save as one bound JSON document", JSON.parse(write.params[1]).links.length, 2);
ok("link save locks the game and commits atomically", log.some((entry) => /FOR UPDATE/.test(entry.text)) && log.some((entry) => entry.text === "COMMIT"));

reset();
setResponder((text) => {
  if (/SELECT game_id, data FROM gamelist_links/.test(text)) {
    return { rows: [{ game_id: 5, data: { links: [] } }, { game_id: 7, data: { links: saved } }] };
  }
  return null;
});
const byGame = await listGamelistLinksByGame();
check("explicitly empty lists remain present and do not resurrect legacy links", byGame[5], []);
check("list query returns named links per game", byGame[7].map((link) => link.name), ["เว็บหลัก", "เว็บสำรอง"]);
ok("list loads every game's links with one query", log.filter((entry) => /SELECT game_id, data FROM gamelist_links/.test(entry.text)).length === 1);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
