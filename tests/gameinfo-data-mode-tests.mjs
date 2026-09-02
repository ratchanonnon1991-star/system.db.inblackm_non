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
check("Topup view preserves IDPASS mode", gameinfoListHref("th", "idpass", false, true), "/gameinfo/th?mode=idpass&view=topup");
check("game manage routes preserve IDPASS", gameinfoGameHref("th", 7, "idpass", true), "/gameinfo/th/7/manage?mode=idpass");
check("game Topup routes preserve IDPASS", gameinfoGameHref("th", 7, "idpass", false, true), "/gameinfo/th/7?mode=idpass&view=topup");
check("pack routes preserve IDPASS", gameinfoPacksHref("th", 7, "idpass"), "/gameinfo/th/7/packs?mode=idpass");

reset();
setResponder((text) => {
  if (/SELECT data, version FROM gameinfo_mode_data/.test(text)) {
    return { rows: [{ data: {
      fields: { region: "CN", platform: "PC", server: "S1", botManual: "Manual" },
      links: [],
      tutorial: { categories: [] },
      warning: { categories: [] },
      packs: { currencies: [{ id: "c", name: "Crystal", categories: [{ id: "cat", name: "Pack", packs: [{ id: "p", name: "60 Crystals", localizedNames: { 7: "English Pack", invalid: "ignored" }, price: "10", amountChargedFee: "9", channelsMain: ["Web"], channelsSecondary: ["Backup"] }] }] }], computedColumns: [], costProfiles: [] },
      formulaVariables: [{ name: "must not be copied" }],
    }, version: 3 }] };
  }
  return null;
});
const loaded = await getGameinfoModeData(7, "idpass");
check("IDPASS keeps its own list fields", loaded.fields, { region: "CN", platform: "PC", server: "S1", botManual: "Manual" });
check("IDPASS packs are sanitized independently", loaded.packs.currencies[0].categories[0].packs[0].serviceEnabled, true);
check("IDPASS preserves localized pack names", loaded.packs.currencies[0].categories[0].packs[0].localizedNames, { 7: "English Pack" });
check("IDPASS preserves secondary channels", loaded.packs.currencies[0].categories[0].packs[0].channelsSecondary, ["Backup"]);
check("shared formula variables are not stored inside a mode", Object.hasOwn(loaded, "formulaVariables"), false);
check("IDPASS load exposes its optimistic version", loaded.version, 3);

reset();
await saveGameinfoModeData(7, "idpass", loaded);
const save = log.find((entry) => /INSERT INTO gameinfo_mode_data/.test(entry.text) && entry.params?.length === 2);
check("mode data saves as one game-scoped document", save?.params?.[0], 7);
ok("saved document contains packs and metadata together", Boolean(JSON.parse(save?.params?.[1] || "{}").packs));

reset();
setResponder((text) => {
  if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 7 }] };
  if (/SELECT data, version FROM gameinfo_mode_data/.test(text)) return { rows: [{ data: loaded, version: 3 }] };
  return null;
});
const updated = await updateGameinfoModeData(7, "idpass", (current) => ({
  ...current,
  fields: { ...current.fields, server: "S2" },
}));
check("partial IDPASS edit preserves other sections", [updated.fields.server, updated.packs.currencies.length], ["S2", 1]);
check("partial IDPASS edit increments its version", updated.version, 4);
ok("partial mode edit locks the parent game and commits", log.some((entry) => /FOR UPDATE/.test(entry.text)) && log.some((entry) => entry.text === "COMMIT"));

// --- IDPASS shares the column system with UID, not the data -------------
// Packs live in a separate store per mode, but a pack column is one shared
// definition. IDPASS therefore has to merge and split it exactly as the uid
// store does, or the two modes drift apart the moment a column is added.
const REGISTRY = [
  {
    column_key: "col_shared",
    label: "ต้นทุน",
    sort_order: 0,
    data: { formula: "[ราคา] * 0.8", kind: "formula", entryMode: "formula", marketKey: "", type: "number", symbol: "", scopeMode: "global" },
  },
  {
    column_key: "col_other",
    label: "ของเกมอื่น",
    sort_order: 1,
    data: { formula: "1", kind: "formula", entryMode: "formula", marketKey: "", type: "number", symbol: "", scopeMode: "global" },
  },
];

reset();
setResponder((text) => {
  if (/FROM gamelist_pack_column_registry/.test(text)) return { rows: REGISTRY };
  if (/SELECT data, version FROM gameinfo_mode_data/.test(text)) {
    return {
      rows: [{
        version: 1,
        data: {
          packs: {
            currencies: [],
            computedColumns: [],
            columnOverrides: { col_shared: { gameFormula: "[ราคา] * 0.5", rowOverrides: { pk_1: "42" } } },
          },
        },
      }],
    };
  }
  return null;
});
const idpassLoad = await getGameinfoModeData(7, "idpass");
check(
  "IDPASS sees every shared column, not just the ones it stored",
  idpassLoad.packs.computedColumns.map((column) => column.key),
  ["col_shared", "col_other"]
);
check(
  "a column IDPASS never touched arrives with the shared formula",
  idpassLoad.packs.computedColumns[1].formula,
  "1"
);
check(
  "IDPASS keeps its own formula for a column it computes differently",
  idpassLoad.packs.computedColumns[0].gameFormula,
  "[ราคา] * 0.5"
);
check(
  "and its own per-pack values",
  idpassLoad.packs.computedColumns[0].rowOverrides,
  { pk_1: "42" }
);

reset();
setResponder((text) => {
  if (/FROM gamelist_pack_column_registry/.test(text)) return { rows: REGISTRY };
  if (/SELECT data FROM gameinfo_mode_data/.test(text)) {
    return { rows: [{ data: { packs: { currencies: [], computedColumns: [], columnOverrides: {} } } }] };
  }
  return null;
});
await saveGameinfoModeData(7, "idpass", idpassLoad);
const idpassSave = log.find((entry) => /INSERT INTO gameinfo_mode_data/.test(entry.text));
const savedPacks = JSON.parse(idpassSave?.params?.[1] || "{}").packs;
check(
  "saving IDPASS stores only its own half of each column",
  savedPacks.columnOverrides,
  { col_shared: { gameFormula: "[ราคา] * 0.5", rowOverrides: { pk_1: "42" } } }
);
ok(
  "and writes the shared definitions back to the registry",
  log.some((entry) => /INSERT INTO gamelist_pack_column_registry/.test(entry.text))
);
ok(
  "an IDPASS save never deletes a column it did not drop",
  !log.some((entry) => /DELETE FROM gamelist_pack_column_registry/.test(entry.text))
);
check(
  "the rollback copy folds IDPASS's own formula back down",
  savedPacks.computedColumns.find((column) => column.key === "col_shared")?.formula,
  "[ราคา] * 0.5"
);

// A CSV import appends its column to computedColumns and hangs the per-pack
// formulas off it. The save splits this game's half out of that shape, so
// values written anywhere else — a columnOverrides map assembled alongside —
// are overwritten by the split and never reach the database.
reset();
setResponder((text) => {
  if (/FROM gamelist_pack_column_registry/.test(text)) {
    return {
      rows: [
        {
          column_key: "col_imported",
          label: "test",
          sort_order: 0,
          data: {
            formula: "",
            entryMode: "manual",
            kind: "formula",
            marketKey: "",
            type: "number",
            symbol: "",
            scopeMode: "global",
          },
        },
      ],
    };
  }
  if (/SELECT data FROM gameinfo_mode_data/.test(text)) {
    return { rows: [{ data: { packs: { currencies: [], computedColumns: [], columnOverrides: {} } } }] };
  }
  return null;
});
await saveGameinfoModeData(7, "idpass", {
  packs: {
    currencies: [],
    costProfiles: [],
    computedColumns: [
      {
        key: "col_imported",
        label: "test",
        formula: "",
        entryMode: "manual",
        kind: "formula",
        marketKey: "",
        type: "number",
        symbol: "",
        scopeMode: "global",
        categoryFormulas: {},
        rowOverrides: { pk_1: "[ราคา]*0.3", pk_2: "[ราคา]*0.4" },
      },
    ],
  },
});
check(
  "an imported column keeps its per-pack formulas through an IDPASS save",
  JSON.parse(
    log.find((entry) => /INSERT INTO gameinfo_mode_data/.test(entry.text))?.params?.[1] || "{}"
  ).packs.columnOverrides,
  { col_imported: { rowOverrides: { pk_1: "[ราคา]*0.3", pk_2: "[ราคา]*0.4" } } }
);


console.log(`\n${pass} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
