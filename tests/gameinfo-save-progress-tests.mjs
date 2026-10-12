import assert from "node:assert/strict";
import { saveGameinfoSections, listChangedGameinfoImages, updateGameinfoImage } from "../src/lib/gameinfo-game-manager.js";
import { recordGameinfoEditAfterSave, refreshGameinfoAlertsAfterSave, runGameinfoPostSave } from "@/server/gameinfo-post-save";
import { cloneGameinfoDataMode } from "@/server/gameinfo-mode-clone";
import { recalculateGameinfoPriceAlerts } from "@/server/gameinfo-market-system";
import { withGameinfoTransaction } from "@/server/gameinfo-gamelist";
import { saveGamelistImage } from "@/server/gameinfo-gamelist-image";
import { recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";
import { log, reset, setResponder } from "@/lib/db";

let savedImages = {};
const images = { A: "a.png", B: "b.png", C: "c.png" };
const sent = [];
let rejectB = true;
function imageSteps() {
  return listChangedGameinfoImages(savedImages, images).map(({ name, imageUrl }) => ({
    label: name,
    run: async () => {
      sent.push(name);
      if (name === "B" && rejectB) throw new Error("network failed");
    },
    onSaved: () => { savedImages = updateGameinfoImage(savedImages, name, imageUrl); },
  }));
}
const partial = await saveGameinfoSections(imageSteps());
assert.deepEqual(partial.completed, ["A"]);
assert.equal(partial.failed, "B");
assert.equal(partial.error.message, "network failed");
assert.deepEqual(savedImages, { A: "a.png" });
assert.deepEqual(sent, ["A", "B"]);
rejectB = false;
const retry = await saveGameinfoSections(imageSteps());
assert.deepEqual(retry.completed, ["B", "C"]);
assert.equal(retry.failed, null);
assert.deepEqual(savedImages, images);
assert.deepEqual(sent, ["A", "B", "B", "C"]);

const reported = [];
const originalError = console.error;
console.error = (...args) => reported.push(args);
try {
  assert.equal(await runGameinfoPostSave("success", async () => {}), true);
  assert.equal(await runGameinfoPostSave("failure", async () => { throw new Error("down"); }), false);
  reset({ fail: "log DB down" });
  assert.equal(await recordGameinfoEditAfterSave({ table: "game_list", pkValue: 7 }), false);
  reset();
  setResponder((text) => {
    if (/SELECT \* FROM gameinfo_game_markets/.test(text)) throw new Error("alerts DB down");
    return null;
  });
  await refreshGameinfoAlertsAfterSave([7, 7, 8], "idpass");
  const queries = log.filter((entry) => /SELECT \* FROM gameinfo_game_markets/.test(entry.text));
  assert.deepEqual(queries.map((entry) => entry.params), [[7, "idpass"], [8, "idpass"]]);
  assert.equal(reported.length, 4);

  // Clone succeeds even if post-commit alert recalculation fails.
  reset();
  setResponder((text) => {
    if (/SELECT data FROM gameinfo_mode_data/.test(text)) return { rows: [{ data: { packs: { currencies: [], computedColumns: [], costProfiles: [] } } }] };
    if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 7 }] };
    if (/SELECT \* FROM gameinfo_game_markets/.test(text)) throw new Error("alerts DB down");
    return null;
  });
  const cloned = await cloneGameinfoDataMode({ gameId: 7, sourceMode: "idpass", targetMode: "uid", scope: "packs", actor: { id: 1, name: "Admin" } });
  assert.equal(cloned.targetMode, "uid");
  const commitAt = log.findIndex((entry) => entry.text.trim() === "COMMIT");
  const alertAt = log.findIndex((entry) => /SELECT \* FROM gameinfo_game_markets/.test(entry.text));
  assert.ok(commitAt >= 0 && alertAt > commitAt);
  assert.deepEqual(log[alertAt].params, [7, "uid"]);

  reset();
  await recalculateGameinfoPriceAlerts({ market: "kaleoz", gameId: 7, dataMode: "idpass" });
  const filtered = log.find((entry) => /SELECT \* FROM gameinfo_game_markets/.test(entry.text));
  assert.match(filtered.text, /market = \$1 AND game_id = \$2 AND data_mode = \$3/);
  assert.deepEqual(filtered.params, ["kaleoz", 7, "idpass"]);

  reset();
  setResponder((text) => {
    if (/INSERT INTO gamelist_pack_audit_logs/.test(text)) throw new Error("audit unavailable");
    return null;
  });
  await assert.rejects(() => withGameinfoTransaction(async (client) => {
    await saveGamelistImage(7, "game.png", client);
    await recordGameinfoAudit({ gameId: 7, area: "image", actor: { id: 1, name: "Admin" }, before: {}, after: { image: true }, client });
  }), /audit unavailable/);
  assert.ok(log.some((entry) => entry.text.trim() === "ROLLBACK"));
  assert.ok(!log.some((entry) => entry.text.trim() === "COMMIT"));
} finally {
  console.error = originalError;
}
console.log("22 passed");
