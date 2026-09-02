// gameinfo-gamelist-packs.js against the recording @/lib/db stub (fed a fake
// "gameinfo" connection via the connections-repository stub) — asserts the
// currencies<->gamelist_packs round trip (ported from the old
// gameinfo-games.js/game_packs suite, now that games/game_packs itself is
// gone and gamelist_packs is the only pack storage left), the computed-column
// sentinel row, and the list-table pack-count/cross-game-channel aggregate
// lookups.
import {
  createGameinfoFormulaPreset,
  deleteGameinfoFormulaPreset,
  createGamelistPackLanguage,
  deleteGamelistPacksForGame,
  getGamelistPacks,
  importGamelistPacks,
  listAllGamelistChannels,
  listAllGamelistPackAudit,
  listGamelistPackAudit,
  listGamelistPackCountByGame,
  listGamelistPackLanguages,
  listGamelistPackServiceByGame,
  listGamelistPackViewPresets,
  listGameinfoFormulaPresets,
  saveGamelistPacks,
  saveGamelistPackViewPreset,
  sanitizeGamelistPackViewPresetLayout,
  updateGameinfoFormulaPreset,
} from "@/server/gameinfo-gamelist-packs.js";
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

const statements = () => log.filter((entry) => entry.text !== "RELEASE").map((e) => e.text.trim());
const find = (pattern) => log.find((entry) => pattern.test(entry.text));

const ORIGINAL_TREE = [
  {
    id: "c1",
    name: "Diamonds",
    image: "",
    categories: [
      {
        id: "cat1",
        name: "Starter",
        packs: [
          {
            id: "pk1",
            name: "Pack A",
            image: "",
            price: "10",
            amountChargedFee: "12",
            serviceEnabled: true,
            serviceStatus: "",
            costProfileId: "",
            channelsMain: ["Wave"],
            channelsSecondary: ["Razer"],
            country: "",
            localizedNames: { 7: "English Pack A", 8: "日本語パックA" },
          },
          {
            id: "pk2",
            name: "Pack B",
            image: "",
            price: "20",
            amountChargedFee: "22",
            serviceEnabled: true,
            serviceStatus: "",
            costProfileId: "",
            channelsMain: ["Wave"],
            channelsSecondary: [],
            country: "",
          },
        ],
      },
    ],
  },
];

async function run() {
  // Warm-up: CREATE TABLE IF NOT EXISTS is cached per connection id and only
  // issued once per process, so get it out of the way before asserting on
  // the log for the calls that follow.
  reset();
  await getGamelistPacks(1);

  // --- shared language memory -----------------------------------------
  reset();
  setResponder((text) => {
    if (/INSERT INTO gamelist_pack_languages/.test(text)) {
      return { rows: [{ id: "7", name: "English" }] };
    }
    return null;
  });
  const language = await createGamelistPackLanguage("  English  ", 9);
  check("languages: creates a reusable normalized language", language, { id: 7, name: "English" });
  const languageInsert = find(/INSERT INTO gamelist_pack_languages/);
  check("languages: binds display name, lookup name, and actor", languageInsert?.params, ["English", "english", 9]);

  reset();
  setResponder((text) => /SELECT id, name FROM gamelist_pack_languages/.test(text)
    ? { rows: [{ id: "7", name: "English" }, { id: "8", name: "日本語" }] }
    : null);
  check("languages: lists the shared choices for every game", await listGamelistPackLanguages(), [
    { id: 7, name: "English" },
    { id: 8, name: "日本語" },
  ]);

  // --- saveGamelistPacks: replaces every row for this game in one transaction
  reset();
  const computedColumns = [
    {
      key: "col_1",
      label: "กำไร",
      formula: "[ราคา]*1.1",
      type: "number",
      rowOverrides: { pk1: "[ราคา]*1.2" },
    },
  ];
  await saveGamelistPacks(5, {
    currencies: ORIGINAL_TREE,
    computedColumns,
    actor: { id: 9, name: "Pack Admin" },
  });

  const saveStmts = statements();
  check(
    "save: wraps the whole replace in a transaction",
    [saveStmts[0], saveStmts.includes("COMMIT")],
    ["BEGIN", true]
  );

  const deleteStmt = find(/^DELETE FROM gamelist_packs WHERE game_id = \$1/);
  ok("save: clears this game's old rows before reinserting", Boolean(deleteStmt));
  check("save: deletes by game id", deleteStmt?.params, [5]);

  const packInserts = log.filter(
    (e) => /^INSERT INTO gamelist_packs/.test(e.text) && e.params?.[1] !== "__computed__"
  );
  check("save: inserts one row per pack", packInserts.length, 2);
  check(
    "save: binds game_id then pack_id then data",
    [packInserts[0].params[0], packInserts[0].params[1]],
    [5, "pk1"]
  );
  const firstPackData = JSON.parse(packInserts[0].params[2]);
  check(
    "save: data carries the currency/category the pack belongs to",
    [firstPackData.currencyId, firstPackData.categoryId],
    ["c1", "cat1"]
  );
  check("save: data keeps this pack's position for reconstruction", firstPackData.packOrder, 0);
  check("save: persists secondary channels", firstPackData.channelsSecondary, ["Razer"]);
  check("save: persists localized pack names", firstPackData.localizedNames, { 7: "English Pack A", 8: "日本語パックA" });
  ok("save: legacy amountCharged is not persisted", !("amountCharged" in firstPackData));
  check("save: the second pack keeps its own position", JSON.parse(packInserts[1].params[2]).packOrder, 1);

  const duplicateNamePriceTree = structuredClone(ORIGINAL_TREE);
  duplicateNamePriceTree[0].categories[0].packs[1].name = " pack a ";
  duplicateNamePriceTree[0].categories[0].packs[1].price = "010.00";
  let duplicateNamePriceError = null;
  try {
    await saveGamelistPacks(5, { currencies: duplicateNamePriceTree, computedColumns: [] });
  } catch (error) {
    duplicateNamePriceError = error;
  }
  check(
    "save: rejects duplicate name and numeric price pairs server-side",
    [duplicateNamePriceError?.status, duplicateNamePriceError?.message],
    [400, "ชื่อ Pack และราคาห้ามซ้ำกันพร้อมกัน"]
  );

  const sentinelInsert = log.find(
    (e) => /^INSERT INTO gamelist_packs/.test(e.text) && e.params?.[1] === "__computed__"
  );
  ok("save: writes a __computed__ sentinel row for computed columns", Boolean(sentinelInsert));
  check(
    "save: sentinel data stores the computed columns array",
    JSON.parse(sentinelInsert.params[2]).columns,
    computedColumns
  );

  const auditInserts = log.filter((e) => /^INSERT INTO gamelist_pack_audit_logs/.test(e.text));
  check("audit: initial save records two creates plus one config change", auditInserts.length, 3);
  check(
    "audit: create records actor, game, pack and action with bound parameters",
    auditInserts[0]?.params?.slice(0, 5),
    [5, "pk1", 9, "Pack Admin", "create"]
  );
  ok("audit: insert happens before COMMIT", log.indexOf(auditInserts[0]) < log.findIndex((e) => e.text.trim() === "COMMIT"));

  // Existing ids are diffed, removed ids become delete events, and a newly
  // generated id whose values match an old pack is recognized as duplicate.
  reset();
  setResponder((text) => {
    if (/^SELECT game_id, pack_id, data FROM gamelist_packs WHERE game_id = \$1/.test(text)) {
      return {
        rows: [
          ...packInserts.map((e) => ({
            game_id: e.params[0],
            pack_id: e.params[1],
            data: JSON.parse(e.params[2]),
          })),
          { game_id: 5, pack_id: "__computed__", data: { columns: computedColumns } },
        ],
      };
    }
    return null;
  });
  const changedTree = structuredClone(ORIGINAL_TREE);
  changedTree[0].categories[0].packs[0].price = "11";
  changedTree[0].categories[0].packs.splice(1, 1);
  changedTree[0].categories[0].packs.push({
    ...structuredClone(ORIGINAL_TREE[0].categories[0].packs[1]),
    id: "pk_copy",
    name: "Pack B (สำเนา)",
  });
  await saveGamelistPacks(5, {
    currencies: changedTree,
    computedColumns,
    actor: { id: 9, name: "Pack Admin" },
    source: "csv_append",
  });
  check(
    "audit: save diff records update, delete, and duplicate actions",
    log
      .filter((e) => /^INSERT INTO gamelist_pack_audit_logs/.test(e.text))
      .map((e) => e.params[4])
      .sort(),
    ["delete", "duplicate", "import_append", "update"]
  );
  check(
    "audit: CSV save records the request source",
    log
      .filter((e) => /^INSERT INTO gamelist_pack_audit_logs/.test(e.text))
      .map((e) => e.params[5]),
    ["csv_append", "csv_append", "csv_append", "csv_append"]
  );

  // Audit failure must roll back the pack replacement too.
  reset();
  setResponder((text) => {
    if (/^INSERT INTO gamelist_pack_audit_logs/.test(text)) throw new Error("audit unavailable");
    return null;
  });
  let auditFailed = false;
  try {
    await saveGamelistPacks(6, {
      currencies: ORIGINAL_TREE,
      computedColumns: [],
      actor: { id: 9, name: "Pack Admin" },
    });
  } catch {
    auditFailed = true;
  }
  ok("audit: insert failure rejects the save", auditFailed);
  ok("audit: insert failure rolls back pack writes", statements().includes("ROLLBACK"));
  check("audit: failed transaction never commits", statements().includes("COMMIT"), false);

  // PostgreSQL JSONB may return object keys in a different order. Equal data
  // must not become a fake update event merely because JSON key order changed.
  reset();
  setResponder((text) => {
    if (/^SELECT game_id, pack_id, data FROM gamelist_packs WHERE game_id = \$1/.test(text)) {
      return {
        rows: [
          ...packInserts.map((e) => {
            const data = JSON.parse(e.params[2]);
            const reversed = Object.fromEntries(Object.entries(data).reverse());
            return { game_id: e.params[0], pack_id: e.params[1], data: reversed };
          }),
          { game_id: 5, pack_id: "__computed__", data: { columns: computedColumns } },
        ],
      };
    }
    return null;
  });
  await saveGamelistPacks(5, {
    currencies: ORIGINAL_TREE,
    computedColumns,
    actor: { id: 9, name: "Pack Admin" },
  });
  check(
    "audit: JSONB key-order differences do not create fake events",
    log.filter((e) => /^INSERT INTO gamelist_pack_audit_logs/.test(e.text)).length,
    0
  );

  // --- getGamelistPacks: round-trips the tree + computed columns back out ---
  reset();
  setResponder((text) => {
    if (/^SELECT game_id, pack_id, data FROM gamelist_packs WHERE game_id = \$1/.test(text)) {
      return {
        rows: [
          ...packInserts.map((e) => ({ game_id: e.params[0], pack_id: e.params[1], data: JSON.parse(e.params[2]) })),
          { game_id: 5, pack_id: "__computed__", data: JSON.parse(sentinelInsert.params[2]) },
        ],
      };
    }
    return null;
  });
  const loaded = await getGamelistPacks(5);
  check("round-trip: reconstructs the original currency/category/pack tree", loaded.currencies, ORIGINAL_TREE);
  check("round-trip: reconstructs the computed columns", loaded.computedColumns, computedColumns);

  reset();
  setResponder(() => ({ rows: [] }));
  const empty = await getGamelistPacks(5);
  check("empty: no rows gives empty data and version-one config", empty, {
    currencies: [],
    computedColumns: [],
    costProfiles: [],
    schemaVersion: 1,
    version: 1,
  });

  reset();
  setResponder((text) => /SELECT version FROM gamelist_pack_revisions/.test(text)
    ? { rows: [{ version: 2 }] }
    : null);
  let stalePackError = null;
  try {
    await saveGamelistPacks(5, {
      currencies: ORIGINAL_TREE,
      computedColumns,
      expectedVersion: 1,
    });
  } catch (error) {
    stalePackError = error;
  }
  check("concurrency: stale pack save returns conflict", stalePackError?.status, 409);
  check("concurrency: stale pack save cannot delete current rows", Boolean(find(/^DELETE FROM gamelist_packs/)), false);

  // --- listGamelistPackCountByGame: excludes the __computed__ sentinel ------
  reset();
  setResponder((text) => {
    if (/^SELECT game_id, COUNT\(\*\)::int AS pack_count FROM gamelist_packs/.test(text)) {
      return { rows: [{ game_id: 5, pack_count: 2 }, { game_id: 7, pack_count: 1 }] };
    }
    return null;
  });
  const counts = await listGamelistPackCountByGame();
  check("pack count: maps game_id to its count", counts, { 5: 2, 7: 1 });
  const countStmt = find(/^SELECT game_id, COUNT\(\*\)::int AS pack_count FROM gamelist_packs/);
  ok("pack count: excludes the computed sentinel", countStmt && /pack_id != \$1/.test(countStmt.text));
  check("pack count: binds the sentinel value", countStmt?.params, ["__computed__"]);

  reset();
  setResponder((text) => {
    if (/disabled_count/.test(text)) {
      return { rows: [{ game_id: 5, total_count: 3, disabled_count: 1 }] };
    }
    return null;
  });
  check("service summary: returns disabled packs per game", await listGamelistPackServiceByGame(), {
    5: { total: 3, disabled: 1 },
  });

  // --- listAllGamelistChannels: merges main+secondary across every game -----
  reset();
  setResponder((text) => {
    if (/^SELECT data FROM gamelist_packs WHERE pack_id != \$1/.test(text)) {
      return {
        rows: [
          { data: { channelsMain: ["Wave", "TrueMoney"], channelsSecondary: ["Shopee"] } },
          { data: { channelsMain: ["TrueMoney"], channelsSecondary: [] } },
        ],
      };
    }
    return null;
  });
  const allChannels = await listAllGamelistChannels();
  check(
    "all channels: dedupes and sorts main+secondary from every game into one flat list",
    allChannels,
    ["Shopee", "TrueMoney", "Wave"]
  );

  // --- deleteGamelistPacksForGame ---------------------------------------------
  reset();
  await deleteGamelistPacksForGame(5);
  const cleanupStmt = find(/^DELETE FROM gamelist_packs WHERE game_id = \$1/);
  ok("cleanup: deletes every row for the game", Boolean(cleanupStmt));
  check("cleanup: binds the game id", cleanupStmt?.params, [5]);

  // --- listGamelistPackAudit --------------------------------------------
  reset();
  setResponder((text) => {
    if (/FROM gamelist_pack_audit_logs/.test(text)) {
      return {
        rows: [
          {
            id: 3,
            game_id: 5,
            pack_id: "pk1",
            actor_id: 9,
            actor_name: "Pack Admin",
            action: "update",
            source: "editor",
            before_data: { price: "10" },
            after_data: { price: "12" },
            created_at: "2026-08-17T10:00:00.000Z",
          },
        ],
      };
    }
    return null;
  });
  const history = await listGamelistPackAudit(5, 9999);
  check("history: maps database fields to API fields", history[0], {
    id: 3,
    gameId: 5,
    gameName: "Game ID 5",
    packId: "pk1",
    actorId: 9,
    actorName: "Pack Admin",
    action: "update",
    source: "editor",
    area: "pack",
    dataMode: "uid",
    before: { price: "10" },
    after: { price: "12" },
    createdAt: "2026-08-17T10:00:00.000Z",
  });
  const historyQuery = find(/FROM gamelist_pack_audit_logs/);
  check("history: binds game id and clamps the limit", historyQuery?.params, [5, 500]);

  // --- multi-game CSV import -------------------------------------------
  reset();
  setResponder((text) => {
    if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 5 }] };
    if (/SELECT game_id, pack_id, data FROM gamelist_packs/.test(text)) return { rows: [] };
    return null;
  });
  const bulk = await importGamelistPacks(
    [{ gameId: 5, currencies: ORIGINAL_TREE, packCount: 2 }],
    "replace",
    { id: 9, name: "Pack Admin" }
  );
  check("bulk import returns imported game and pack counts", bulk, { gameCount: 1, packCount: 2 });
  ok("bulk import locks the target game before writing", Boolean(find(/SELECT id FROM game_list.*FOR UPDATE/)));
  check(
    "bulk import records csv_replace as the audit source",
    log.filter((entry) => /^INSERT INTO gamelist_pack_audit_logs/.test(entry.text))[0]?.params?.[5],
    "csv_replace"
  );
  ok("bulk import commits all games as one transaction", statements().includes("COMMIT"));

  // A CSV can carry a column for a game without carrying any of its packs.
  // Replacing that game with nothing would delete every pack it has, which is
  // never what such a file meant.
  reset();
  const EXISTING_PACK_ROW = {
    game_id: 5,
    pack_id: "pk_keep",
    data: {
      currencyId: "c1", currencyName: "Gem", currencyImage: "", currencyOrder: 0,
      categoryId: "cat1", categoryName: "Gem", categoryOrder: 0, packOrder: 0,
      name: "60 Gems", price: "100", amountChargedFee: "90",
      channelsMain: ["Wavepay"], channelsSecondary: [], country: "Thailand",
    },
  };
  setResponder((text) => {
    if (/SELECT id FROM game_list/.test(text)) return { rows: [{ id: 5 }] };
    if (/SELECT game_id, pack_id, data FROM gamelist_packs/.test(text)) return { rows: [EXISTING_PACK_ROW] };
    if (/FROM gamelist_pack_column_registry/.test(text)) return { rows: [] };
    return null;
  });
  await importGamelistPacks(
    [{ gameId: 5, currencies: [], packCount: 0, columns: [{ key: "col_new", label: "ใหม่", formula: "", entryMode: "manual", rowOverrides: {} }] }],
    "replace",
    { id: 9, name: "Pack Admin" }
  );
  const columnsOnlyInserts = log.filter((entry) => /^INSERT INTO gamelist_packs/.test(entry.text));
  ok(
    "a columns-only import keeps the packs the game already had",
    columnsOnlyInserts.some((entry) => entry.params?.[1] === "pk_keep")
  );
  ok(
    "and still registers the column it came for",
    log.some((entry) => /INSERT INTO gamelist_pack_column_registry/.test(entry.text))
  );

  // The registry is one shared definition per column, used by every game and
  // by both storage modes. A save must only delete what it actually dropped —
  // deleting "everything this request did not mention" would let one game's
  // save destroy other games' columns.
  reset();
  const REGISTRY_ROWS = [
    { column_key: "col_keep", label: "เก็บไว้", sort_order: 0, data: { formula: "1", kind: "formula", entryMode: "formula", marketKey: "", type: "number", symbol: "", scopeMode: "global" } },
    { column_key: "col_drop", label: "ลบทิ้ง", sort_order: 1, data: { formula: "2", kind: "formula", entryMode: "formula", marketKey: "", type: "number", symbol: "", scopeMode: "global" } },
  ];
  setResponder((text) => {
    if (/FROM gamelist_pack_column_registry/.test(text)) return { rows: REGISTRY_ROWS };
    if (/SELECT version FROM gamelist_pack_revisions/.test(text)) return { rows: [{ version: 1 }] };
    if (/SELECT game_id, pack_id, data FROM gamelist_packs/.test(text)) {
      return { rows: [{ game_id: 5, pack_id: "__computed__", data: { schemaVersion: 3, columns: [], columnOverrides: {} } }] };
    }
    return null;
  });
  await saveGamelistPacks(5, {
    currencies: [],
    // Saving only one of the two registered columns: the other was deleted.
    computedColumns: [{ key: "col_keep", label: "เก็บไว้", formula: "1", entryMode: "formula", kind: "formula", marketKey: "", type: "number", symbol: "", scopeMode: "global", categoryFormulas: {}, rowOverrides: {} }],
    costProfiles: [],
  });
  const registryDeletes = log.filter((entry) => /DELETE FROM gamelist_pack_column_registry/.test(entry.text));
  check(
    "a save deletes only the column it dropped",
    registryDeletes[0]?.params?.[0],
    ["col_drop"]
  );
  ok(
    "the delete never targets everything it did not mention",
    !registryDeletes.some((entry) => /NOT \(column_key/.test(entry.text))
  );

  // --- combined history ------------------------------------------------
  reset();
  setResponder((text) => {
    if (/FROM gamelist_pack_audit_logs a/.test(text)) {
      return { rows: [{ id: 8, game_id: 5, game: "Game A", pack_id: "pk1", actor_id: 9, actor_name: "Admin", action: "update", source: "editor", before_data: {}, after_data: { name: "Pack" }, created_at: "2026-08-17T10:00:00.000Z" }] };
    }
    return null;
  });
  const allHistory = await listAllGamelistPackAudit(9999);
  check("combined history includes the game name", allHistory[0].gameName, "Game A");
  check("combined history clamps its one bound limit", find(/FROM gamelist_pack_audit_logs a/)?.params, [2000]);

  // --- shared Formula Memory ------------------------------------------
  reset();
  setResponder((text) => /FROM gameinfo_formula_presets/.test(text)
    ? {
        rows: [{
          id: "51",
          name: "กำไรมาตรฐาน",
          formula: "[ราคา] * 0.1",
          result_type: "number",
          symbol: "%",
          created_by: 9,
          created_by_name: "Admin",
          updated_by: 9,
          updated_by_name: "Admin",
          created_at: "2026-08-28T01:00:00.000Z",
          updated_at: "2026-08-28T01:00:00.000Z",
          version: "4",
        }],
      }
    : null);
  const formulaPresets = await listGameinfoFormulaPresets();
  check("formula memory: lists shared presets without a game or user filter", formulaPresets[0].id, 51);
  check("formula memory: list exposes each preset version", formulaPresets[0].version, 4);
  check("formula memory: list query has no scope parameters", find(/FROM gameinfo_formula_presets/)?.params, null);

  reset();
  setResponder((text) => /^INSERT INTO gameinfo_formula_presets/.test(text)
    ? {
        rows: [{
          id: "52",
          name: "กำไรทีม",
          formula: "[ราคา] * 0.2",
          result_type: "number",
          symbol: "฿",
          created_by: 9,
          created_by_name: "Admin",
          updated_by: 9,
          updated_by_name: "Admin",
          created_at: "2026-08-28T02:00:00.000Z",
          updated_at: "2026-08-28T02:00:00.000Z",
        }],
      }
    : null);
  const createdFormulaPreset = await createGameinfoFormulaPreset(
    { name: "  กำไรทีม  ", formula: " [ราคา] * 0.2 ", type: "number", symbol: "฿" },
    { id: 9, name: "Admin" }
  );
  check("formula memory: creates a normalized shared preset", createdFormulaPreset.name, "กำไรทีม");
  check(
    "formula memory: binds normalized name, formula metadata and actor",
    find(/^INSERT INTO gameinfo_formula_presets/)?.params,
    [
      "กำไรทีม",
      "กำไรทีม".normalize("NFKC").toLocaleLowerCase("en-US"),
      "[ราคา] * 0.2",
      "number",
      "฿",
      9,
      "Admin",
    ]
  );

  reset();
  setResponder((text) => /^UPDATE gameinfo_formula_presets/.test(text)
    ? {
        rows: [{
          id: "52",
          name: "กำไรใหม่",
          formula: "[ราคา] * 0.3",
          result_type: "number",
          symbol: "฿",
          created_by: 9,
          created_by_name: "Admin",
          updated_by: 10,
          updated_by_name: "Editor",
          created_at: "2026-08-28T02:00:00.000Z",
          updated_at: "2026-08-28T03:00:00.000Z",
          version: "2",
        }],
      }
    : null);
  const updatedFormulaPreset = await updateGameinfoFormulaPreset(
    52,
    { name: "กำไรใหม่", formula: "[ราคา] * 0.3", type: "number", symbol: "฿", version: 1 },
    { id: 10, name: "Editor" }
  );
  check("formula memory: any editor can update the shared preset", updatedFormulaPreset.updatedByName, "Editor");
  check("formula memory: update increments the preset version", updatedFormulaPreset.version, 2);

  reset();
  setResponder((text) => {
    if (/^UPDATE gameinfo_formula_presets/.test(text)) return { rows: [] };
    if (/^SELECT 1 FROM gameinfo_formula_presets/.test(text)) return { rows: [{ exists: 1 }] };
    return null;
  });
  let stalePresetError = null;
  try {
    await updateGameinfoFormulaPreset(
      52,
      { name: "สูตรเก่า", formula: "[ราคา]", type: "number", version: 1 },
      { id: 11, name: "Stale editor" }
    );
  } catch (error) {
    stalePresetError = error;
  }
  check("formula memory: stale update returns conflict", stalePresetError?.status, 409);

  reset();
  setResponder((text) => /^DELETE FROM gameinfo_formula_presets/.test(text)
    ? { rows: [{ id: "52" }] }
    : null);
  check("formula memory: delete does not touch copied pack formulas", await deleteGameinfoFormulaPreset(52, 2), { id: 52 });

  // --- personal column presets (Tasks 15 + 16) ------------------------
  check(
    "preset layout: only keeps unique, bounded string column ids",
    sanitizeGamelistPackViewPresetLayout({
      order: ["price", "price", "", 123, "computed:profit"],
      hidden: ["country", "country", "  ", "price"],
      filters: [
        { columnId: "name", operator: "contains", value: "diamond" },
        { columnId: "", operator: "equals", value: "ignored" },
      ],
    }),
    {
      order: ["price", "computed:profit"],
      hidden: ["country", "price"],
      filters: [{ columnId: "name", operator: "contains", value: "diamond" }],
    }
  );

  reset();
  setResponder((text) => {
    if (/FROM gamelist_pack_view_presets/.test(text)) {
      return {
        rows: [
          {
            id: 42,
            game_id: 5,
            user_id: 9,
            surface: "view",
            name: "เฉพาะราคา",
            layout: { order: ["price", "name"], hidden: ["country"] },
            created_at: "2026-08-17T10:00:00.000Z",
            updated_at: "2026-08-17T11:00:00.000Z",
          },
        ],
      };
    }
    return null;
  });
  const presets = await listGamelistPackViewPresets({ gameId: 5, userId: 9 });
  check("preset list: scopes rows to game and user", presets[0], {
    id: 42,
    gameId: 5,
    userId: 9,
    surface: "view",
    locked: false,
    name: "เฉพาะราคา",
    layout: { order: ["price", "name"], hidden: ["country"] },
    createdAt: "2026-08-17T10:00:00.000Z",
    updatedAt: "2026-08-17T11:00:00.000Z",
  });
  check(
    "preset list: binds game and user instead of interpolating them",
    find(/FROM gamelist_pack_view_presets/)?.params,
    [5, 9]
  );

  reset();
  setResponder((text) => {
    if (/^INSERT INTO gamelist_pack_view_presets/.test(text)) {
      return {
        rows: [
          {
            id: 43,
            game_id: 5,
            user_id: 9,
            surface: "edit",
            name: "แก้ไขแบบย่อ",
            layout: { order: ["name", "price"], hidden: ["image"] },
            created_at: "2026-08-17T12:00:00.000Z",
            updated_at: "2026-08-17T12:00:00.000Z",
          },
        ],
      };
    }
    return null;
  });
  const createdPreset = await saveGamelistPackViewPreset({
    gameId: 5,
    userId: 9,
    surface: "edit",
    name: "  แก้ไขแบบย่อ  ",
    layout: { order: ["name", "price"], hidden: ["image"] },
  });
  check("preset save: creates and returns the normalized named preset", createdPreset, {
    id: 43,
    gameId: 5,
    userId: 9,
    surface: "edit",
    locked: true,
    name: "แก้ไขแบบย่อ",
    layout: { order: ["name", "price"], hidden: ["image"] },
    createdAt: "2026-08-17T12:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
  });
  const presetInsert = find(/^INSERT INTO gamelist_pack_view_presets/);
  check(
    "preset save: binds JSON layout and its owner scope",
    [presetInsert?.params?.slice(0, 4), JSON.parse(presetInsert?.params?.[4] || "null")],
    [[5, 9, "edit", "แก้ไขแบบย่อ"], { order: ["name", "price"], hidden: ["image"] }]
  );

  function respondToPresetUpdate(existingSurface) {
    return (text) => {
      if (/^SELECT surface FROM gamelist_pack_view_presets/.test(text)) {
        return { rows: [{ surface: existingSurface }] };
      }
      if (/^UPDATE gamelist_pack_view_presets/.test(text)) {
        return {
          rows: [
            {
              id: 43,
              game_id: 5,
              user_id: 9,
              surface: existingSurface,
              name: "แก้ไขแบบเต็ม",
              layout: { order: ["price", "name"], hidden: [] },
              created_at: "2026-08-17T12:00:00.000Z",
              updated_at: "2026-08-17T13:00:00.000Z",
            },
          ],
        };
      }
      return null;
    };
  }

  reset();
  setResponder(respondToPresetUpdate("edit"));
  const updatedPreset = await saveGamelistPackViewPreset({
    gameId: 5,
    userId: 9,
    surface: "edit",
    presetId: 43,
    name: "แก้ไขแบบเต็ม",
    layout: { order: ["price", "name"], hidden: [] },
  });
  check("preset update: returns the revised preset", updatedPreset.name, "แก้ไขแบบเต็ม");
  const presetUpdate = find(/^UPDATE gamelist_pack_view_presets/);
  check(
    "preset update: limits the write to the selected user and game",
    presetUpdate?.params?.slice(0, 4),
    [43, 5, 9, "แก้ไขแบบเต็ม"]
  );
  check("preset update: no longer scopes the write by surface", /AND surface = /.test(presetUpdate?.text || ""), false);

  reset();
  setResponder(respondToPresetUpdate("edit"));
  let lockedError = null;
  try {
    await saveGamelistPackViewPreset({
      gameId: 5,
      userId: 9,
      surface: "view",
      presetId: 43,
      name: "แก้ไขแบบเต็ม",
      layout: { order: ["price", "name"], hidden: [] },
    });
  } catch (error) {
    lockedError = error;
  }
  check("preset lock: the view cannot overwrite an editor preset", lockedError?.status, 403);
  check("preset lock: refuses before writing", find(/^UPDATE gamelist_pack_view_presets/), undefined);

  reset();
  setResponder(respondToPresetUpdate("view"));
  const viewOwned = await saveGamelistPackViewPreset({
    gameId: 5,
    userId: 9,
    surface: "view",
    presetId: 43,
    name: "แก้ไขแบบเต็ม",
    layout: { order: ["price", "name"], hidden: [] },
  });
  check("preset lock: the view may overwrite its own preset", viewOwned.name, "แก้ไขแบบเต็ม");
  check("preset lock: an editor preset reports itself as locked", updatedPreset.locked, true);
  check("preset lock: a view preset is not locked", viewOwned.locked, false);

  console.log(`\n${pass} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  process.exit(failures.length ? 1 : 0);
}

run();
