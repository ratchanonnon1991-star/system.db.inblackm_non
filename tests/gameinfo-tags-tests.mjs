import {
  listGamelistPublisherImages,
  listGamelistPublishersByGame,
  listGamelistTagImages,
  listGamelistTagsByGame,
  normalizeGamelistPublishers,
  normalizeGamelistTags,
  saveGamelistPublisherImage,
  saveGamelistPublishers,
  saveGamelistTagImage,
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
check("publishers trim and dedupe case-insensitively", normalizeGamelistPublishers([" Garena ", "garena", "Riot   Games"]), ["Garena", "Riot Games"]);

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

reset();
check("save tag image", await saveGamelistTagImage(" RPG ", " https://example.com/rpg.png "), {
  name: "RPG",
  imageUrl: "https://example.com/rpg.png",
});
const imageWrite = log.find((entry) => /INSERT INTO gamelist_tag_catalog/.test(entry.text));
check("tag image uses normalized key", imageWrite.params, ["rpg", "RPG", "https://example.com/rpg.png"]);

reset();
setResponder((text) => /SELECT name, image_url FROM gamelist_tag_catalog/.test(text)
  ? { rows: [{ name: "RPG", image_url: "https://example.com/rpg.png" }] }
  : null);
check("list returns tag images", await listGamelistTagImages(), { RPG: "https://example.com/rpg.png" });

reset();
setResponder((text) => {
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 5 }] };
  return null;
});
check("save returns normalized publishers", await saveGamelistPublishers(5, ["Garena", " garena ", "Riot Games"]), ["Garena", "Riot Games"]);
const publisherWrite = log.find((entry) => /INSERT INTO gamelist_publishers/.test(entry.text));
check("publishers save as one JSON document", JSON.parse(publisherWrite.params[1]).publishers, ["Garena", "Riot Games"]);

reset();
setResponder((text) => /SELECT game_id, data FROM gamelist_publishers/.test(text)
  ? { rows: [{ game_id: 5, data: { publishers: ["Garena"] } }] }
  : null);
check("list returns publishers by game", await listGamelistPublishersByGame(), { 5: ["Garena"] });

reset();
check("save publisher image", await saveGamelistPublisherImage(" Garena ", " https://example.com/garena.png "), {
  name: "Garena",
  imageUrl: "https://example.com/garena.png",
});
const publisherImageWrite = log.find((entry) => /INSERT INTO gamelist_publisher_catalog/.test(entry.text));
check("publisher image uses normalized key", publisherImageWrite.params, ["garena", "Garena", "https://example.com/garena.png"]);

reset();
setResponder((text) => /SELECT name, image_url FROM gamelist_publisher_catalog/.test(text)
  ? { rows: [{ name: "Garena", image_url: "https://example.com/garena.png" }] }
  : null);
check("list returns publisher images", await listGamelistPublisherImages(), { Garena: "https://example.com/garena.png" });

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
