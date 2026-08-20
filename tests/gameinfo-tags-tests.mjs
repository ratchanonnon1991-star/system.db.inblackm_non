import {
  listGamelistTagsByGame,
  normalizeGamelistTags,
  saveGamelistTags,
} from "@/server/gameinfo-gamelist-tags.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass += 1;
  else failures.push(name);
}

check("tags trim and dedupe case-insensitively", normalizeGamelistTags([" RPG ", "rpg", "Open   World"]), ["RPG", "Open World"]);

reset();
setResponder((text) => {
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 5 }] };
  return null;
});
check("save returns normalized tags", await saveGamelistTags(5, ["Casual", " casual ", "MOBA"]), ["Casual", "MOBA"]);
const write = log.find((entry) => /INSERT INTO gamelist_tags/.test(entry.text));
check("tags save as one JSON document", JSON.parse(write.params[1]).tags, ["Casual", "MOBA"]);

reset();
setResponder((text) => /SELECT game_id, data FROM gamelist_tags/.test(text)
  ? { rows: [{ game_id: 5, data: { tags: ["Casual", "MOBA"] } }] }
  : null);
check("list returns tags by game", await listGamelistTagsByGame(), { 5: ["Casual", "MOBA"] });

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
