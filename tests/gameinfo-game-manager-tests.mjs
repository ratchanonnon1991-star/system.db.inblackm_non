import assert from "node:assert/strict";
import { buildGameinfoStatusUpdate, buildGameinfoUpdate } from "../src/lib/gameinfo-game-manager.js";

const draft = { game: "Test", region: "TH", platform: "Mobile", server: "Asia", botManual: "Bot" };
assert.deepEqual(buildGameinfoUpdate(draft), draft);
assert.equal(buildGameinfoUpdate(draft, "idpass").game, undefined);
assert.deepEqual(buildGameinfoStatusUpdate("online"), { enabled: true });
assert.deepEqual(buildGameinfoStatusUpdate("offline"), { enabled: false });

console.log("4 passed");
