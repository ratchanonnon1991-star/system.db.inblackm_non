import {
  getGamelistWarning,
  listGamelistWarningPresence,
  saveGamelistWarning,
} from "@/server/gameinfo-gamelist-tutorial.js";
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
  if (/SELECT warning_data FROM gamelist_tutorials WHERE/.test(text)) {
    return {
      rows: [{
        warning_data: {
          categories: [{
            id: "warning_cat",
            name: "ก่อนเติม",
            steps: [{ id: "warning_step", title: "ระวัง", description: "ตรวจ UID", imageUrls: [], videoUrl: "" }],
          }],
        },
      }],
    };
  }
  return null;
});
const warning = await getGamelistWarning(5);
check("warning content loads independently from tutorial data", warning.categories[0].name, "ก่อนเติม");
ok("warning schema is added compatibly to the existing tutorial table", log.some((entry) => /ADD COLUMN IF NOT EXISTS warning_data/.test(entry.text)));

reset();
const saved = await saveGamelistWarning(5, warning.categories);
check("warning save returns normalized content", saved.categories[0].steps[0].description, "ตรวจ UID");
const warningWrite = log.find((entry) => /INSERT INTO gamelist_tutorials \(game_id, data, warning_data/.test(entry.text));
check("warning save binds the game id separately", warningWrite?.params?.[0], 5);
ok("warning save writes warning_data without replacing tutorial data on conflict", /DO UPDATE SET warning_data/.test(warningWrite?.text || ""));

reset();
setResponder((text) => {
  if (/SELECT game_id FROM gamelist_tutorials/.test(text) && /warning_data/.test(text)) {
    return { rows: [{ game_id: 5 }, { game_id: 9 }] };
  }
  return null;
});
check("warning presence supports list-page buttons", await listGamelistWarningPresence(), { 5: true, 9: true });

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
