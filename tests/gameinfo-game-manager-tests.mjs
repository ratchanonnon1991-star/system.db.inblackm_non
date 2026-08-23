import assert from "node:assert/strict";
import {
  buildGameinfoStatusUpdate,
  buildGameinfoUpdate,
  listChangedGameinfoImages,
  updateGameinfoImage,
} from "../src/lib/gameinfo-game-manager.js";

const draft = { game: "Test", region: "TH", platform: "Mobile", server: "Asia", botManual: "Bot" };
assert.deepEqual(buildGameinfoUpdate(draft), draft);
assert.equal(buildGameinfoUpdate(draft, "idpass").game, undefined);
assert.equal(buildGameinfoUpdate({ ...draft, vpn: "YES" }).vpn, "YES");
assert.equal(buildGameinfoUpdate({ ...draft, vpn: "YES" }, "idpass").vpn, undefined);
assert.deepEqual(buildGameinfoStatusUpdate("online"), { enabled: true });
assert.deepEqual(buildGameinfoStatusUpdate("offline"), { enabled: false });
assert.deepEqual(updateGameinfoImage({ RPG: "old.png" }, "rpg", "new.png"), { RPG: "new.png" });
assert.deepEqual(updateGameinfoImage({ RPG: "old.png" }, "rpg", ""), {});
assert.deepEqual(listChangedGameinfoImages({ RPG: "old.png" }, {}), [{ name: "RPG", imageUrl: "" }]);

console.log("9 passed");
