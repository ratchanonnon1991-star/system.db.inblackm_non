import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloneGameinfoDataMode } from "@/server/gameinfo-mode-clone.js";
import { createGameListRows } from "@/server/gameinfo-gamelist.js";
import { log, reset, setResponder } from "@/lib/db.js";

const modeData = {
  fields: { region: "TH", platform: "PC", server: "S1", botManual: "Manual" },
  links: [],
  tutorial: { categories: [] },
  warning: { categories: [] },
  packs: { currencies: [], computedColumns: [], costProfiles: [] },
};

reset();
setResponder((text) => {
  if (/SELECT data FROM gameinfo_mode_data/.test(text)) return { rows: [{ data: modeData }] };
  if (/UPDATE game_list/.test(text)) return { rows: [{ id: 7 }] };
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 7 }] };
  if (/SELECT game_id, pack_id, data FROM gamelist_packs/.test(text)) return { rows: [] };
  if (/INSERT INTO gamelist_tutorials \(game_id, data, warning_data/.test(text)) throw new Error("warning write failed");
  return null;
});

await assert.rejects(() => cloneGameinfoDataMode({
  gameId: 7,
  sourceMode: "idpass",
  targetMode: "uid",
  actor: { id: 1, name: "Admin" },
}));
assert.ok(log.some((entry) => entry.text.trim() === "ROLLBACK"));
assert.ok(!log.some((entry) => entry.text.trim() === "COMMIT"));

const importRoute = readFileSync(new URL("../src/app/api/gameinfo/import/apply/route.js", import.meta.url), "utf8");
assert.ok(importRoute.includes("withGameinfoTransaction(async (client)"));
assert.ok(importRoute.includes('saveGameinfoModeData(game.gameId, "idpass", {'));

const gameListImportRoute = readFileSync(new URL("../src/app/api/gameinfo/gamelist/import/route.js", import.meta.url), "utf8");
assert.ok(gameListImportRoute.includes("withGameinfoTransaction(async (client)"));
assert.ok(gameListImportRoute.includes("createGameListRows(parsed.rows, actor, client)"));
assert.ok(gameListImportRoute.includes("}, client)"));

const transactionLog = [];
const transactionClient = {
  async query(text) {
    transactionLog.push(text.trim());
    if (/^INSERT INTO game_list/.test(text.trim())) {
      return { rows: [{ id: 8, game: "Test", vpn: "NO" }] };
    }
    return { rows: [] };
  },
};
await createGameListRows([{ game: "Test" }], null, transactionClient);
assert.ok(transactionLog.some((text) => /^INSERT INTO game_list/.test(text)));
assert.ok(!transactionLog.includes("BEGIN"));
assert.ok(!transactionLog.includes("COMMIT"));
assert.ok(!transactionLog.includes("ROLLBACK"));

console.log("11 passed");
