// The daily sheet read keeps what it did for the sheet-import page, whether it worked or not.
import assert from "node:assert/strict";
import { log, reset, setResponder } from "@/lib/db";
import { getLatestGameinfoSheetSyncRun, recordGameinfoSheetSyncRun } from "../src/server/gameinfo-sheet-sync-runs.js";
import { runGameinfoSheetSync } from "../src/server/gameinfo-sheet-status-scheduler.js";

let passed = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  passed += 1;
}

const summary = { games: 1, packs: 1, failed: 1 };
const results = [
  { gameId: 3, game: "LOVE AND DEEPSPACE", changed: 1, changes: [{ packId: "a", name: "Gentle Sip Pack II", from: "open", to: "new", expiresAt: "2026-11-04", mode: "idpass" }] },
  { gameId: 4, game: "Quiet Game", changed: 0, changes: [] },
  { gameId: 5, game: "Stuck Game", changed: 0, error: "แพ็คถูกแก้ไประหว่างนี้" },
];

reset();
await recordGameinfoSheetSyncRun({ summary, results });
const insert = log.find((entry) => /^INSERT INTO gameinfo_sheet_sync_runs/.test(entry.text));
check("a run binds its counts, with no error", insert.params.slice(0, 4), [1, 1, 1, ""]);
check(
  "only games something happened in are kept",
  JSON.parse(insert.params[4]).map((item) => [item.gameId, item.changes.length, item.error]),
  [[3, 1, ""], [5, 0, "แพ็คถูกแก้ไประหว่างนี้"]]
);
check("old runs are trimmed", log.find((entry) => /^DELETE FROM gameinfo_sheet_sync_runs/.test(entry.text))?.params, [30]);

reset();
await recordGameinfoSheetSyncRun({ error: "อ่านชีตไม่ได้" });
check("a run that failed outright keeps why", log.find((entry) => /^INSERT/.test(entry.text)).params.slice(0, 4), [0, 0, 0, "อ่านชีตไม่ได้"]);

reset();
check("no run yet reads as null", await getLatestGameinfoSheetSyncRun(), null);
reset();
setResponder((text) => (/^SELECT finished_at/.test(text) ? { rows: [{ finished_at: new Date("2026-11-01T23:00:00Z"), games: 1, packs: 12, failed: 0, error: "", details: [] }] } : null));
check("the latest run comes back for the page", await getLatestGameinfoSheetSyncRun(), { finishedAt: "2026-11-01T23:00:00.000Z", games: 1, packs: 12, failed: 0, error: "", details: [] });

const quiet = { info: console.info, error: console.error };
console.info = () => {};
console.error = () => {};
const kept = [];
await runGameinfoSheetSync({ sync: async () => ({ summary, results }), record: async (run) => kept.push(run) });
check("a run that worked is kept", kept.pop().summary, summary);
await runGameinfoSheetSync({ sync: async () => { throw new Error("no key"); }, record: async (run) => kept.push(run) });
check("a run that threw is kept too", kept.pop(), { error: "no key" });
await runGameinfoSheetSync({ sync: async () => ({ summary, results }), record: async () => { throw new Error("db down"); } });
check("failing to keep it does not stop the schedule", true, true);
console.info = quiet.info;
console.error = quiet.error;

console.log(`gameinfo-sheet-sync-runs: ${passed} passed`);
