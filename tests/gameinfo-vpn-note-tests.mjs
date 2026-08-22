import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getGamelistVpnNote,
  listGamelistVpnNotePresence,
} from "@/server/gameinfo-gamelist-tutorial.js";
import { reset, setResponder } from "@/lib/db.js";

reset();
setResponder((text) => {
  if (/SELECT vpn_data FROM gamelist_tutorials WHERE/.test(text)) {
    return { rows: [{ vpn_data: { categories: [{ id: "vpn", name: "ประเทศ", steps: [{ id: "th", title: "ไทย", description: "เลือกไทย", imageUrls: [], videoUrl: "" }] }] } }] };
  }
  return null;
});
const note = await getGamelistVpnNote(5);
assert.equal(note.categories[0].steps[0].description, "เลือกไทย");

reset();
setResponder((text) => /vpn_data/.test(text) ? { rows: [{ game_id: 5 }, { game_id: 9 }] } : null);
assert.deepEqual(await listGamelistVpnNotePresence(), { 5: true, 9: true });

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const table = read("../src/components/gameinfo-gamelist-table.js");
const manager = read("../src/components/gameinfo-game-manager.js");
const modal = read("../src/components/gameinfo-tutorial-modal.js");
assert.ok(!table.includes("onVpnToggledOn"), "VPN status no longer auto-opens the note");
assert.ok(table.includes("<GameinfoDetailsButton") && table.includes("hasVpnNote={row.hasVpnNote}"), "manage table groups VPN notes under the game details button");
assert.ok(manager.includes('value={draft.vpn}') && manager.includes("<GameinfoDetailsButton"), "detail manager separates VPN status from grouped game details");
assert.ok(modal.includes('isVpn ? "โน้ต VPN"'), "VPN note has its own button label");
assert.ok(modal.includes('label: "วิธีเติม"') && modal.includes('label: "VPN"'), "game details modal exposes tutorial and VPN tabs");

console.log("7 passed");
