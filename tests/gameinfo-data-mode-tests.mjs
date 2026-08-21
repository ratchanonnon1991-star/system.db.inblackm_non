import {
  gameinfoGameHref,
  gameinfoListHref,
  gameinfoPacksHref,
  normalizeGameinfoDataMode,
} from "@/lib/gameinfo-data-mode.js";
import {
  getGameinfoModeData,
  saveGameinfoModeData,
  updateGameinfoModeData,
} from "@/server/gameinfo-mode-data.js";
import { log, reset, setResponder } from "@/lib/db.js";

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}
function ok(name, value) { check(name, Boolean(value), true); }

check("mode defaults to UID", normalizeGameinfoDataMode("unknown"), "uid");
check("IDPASS mode is case-insensitive", normalizeGameinfoDataMode("IDPASS"), "idpass");
check("list routes use a manage path", gameinfoListHref("th", "uid", true), "/gameinfo/th/manage");
check("game manage routes preserve IDPASS", gameinfoGameHref("th", 7, "idpass", true), "/gameinfo/th/7/manage?mode=idpass");
check("pack routes preserve IDPASS", gameinfoPacksHref("th", 7, "idpass"), "/gameinfo/th/7/packs?mode=idpass");

reset();
setResponder((text) => {
  if (/SELECT data FROM gameinfo_mode_data/.test(text)) {
    return { rows: [{ data: {
      fields: { region: "CN", platform: "PC", server: "S1", botManual: "Manual" },
      links: [],
      tutorial: { categories: [] },
      warning: { categories: [] },
      packs: { currencies: [{ id: "c", name: "Crystal", categories: [{ id: "cat", name: "Pack", packs: [{ id: "p", name: "60 Crystals", localizedNames: { 7: "English Pack", invalid: "ignored" }, price: "10", amountChargedFee: "9", channelsMain: ["Web"] }] }] }], computedColumns: [], costProfiles: [] },
      formulaVariables: [{ name: "must not be copied" }],
    } }] };
  }
  return null;
});
const loaded = await getGameinfoModeData(7, "idpass");
check("IDPASS keeps its own list fields", loaded.fields, { region: "CN", platform: "PC", server: "S1", botManual: "Manual" });
check("IDPASS packs are sanitized independently", loaded.packs.currencies[0].categories[0].packs[0].serviceEnabled, true);
check("IDPASS preserves localized pack names", loaded.packs.currencies[0].categories[0].packs[0].localizedNames, { 7: "English Pack" });
check("shared formula variables are not stored inside a mode", Object.hasOwn(loaded, "formulaVariables"), false);

reset();
await saveGameinfoModeData(7, "idpass", loaded);
const save = log.find((entry) => /INSERT INTO gameinfo_mode_data/.test(entry.text) && entry.params?.length === 2);
check("mode data saves as one game-scoped document", save?.params?.[0], 7);
ok("saved document contains packs and metadata together", Boolean(JSON.parse(save?.params?.[1] || "{}").packs));

reset();
setResponder((text) => {
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 7 }] };
  if (/SELECT data FROM gameinfo_mode_data/.test(text)) return { rows: [{ data: loaded }] };
  return null;
});
const updated = await updateGameinfoModeData(7, "idpass", (current) => ({
  ...current,
  fields: { ...current.fields, server: "S2" },
}));
check("partial IDPASS edit preserves other sections", [updated.fields.server, updated.packs.currencies.length], ["S2", 1]);
ok("partial mode edit locks the parent game and commits", log.some((entry) => /FOR UPDATE/.test(entry.text)) && log.some((entry) => entry.text === "COMMIT"));

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
