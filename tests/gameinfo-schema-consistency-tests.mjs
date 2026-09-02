import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../src/server/gameinfo-gamelist-packs.js", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../db-init/004-schema-topup-inblackm.sql", import.meta.url), "utf8");
const expected = "ON gamelist_pack_view_presets (game_id, user_id, name)";

assert.ok(runtime.includes(expected));
assert.ok(bootstrap.includes(expected));
assert.ok(runtime.includes("DROP INDEX IF EXISTS gamelist_pack_view_presets_game_user_surface_name"));
assert.ok(bootstrap.includes("DROP INDEX IF EXISTS gamelist_pack_view_presets_game_user_surface_name"));
assert.ok(runtime.includes("CREATE TABLE IF NOT EXISTS gameinfo_formula_presets"));
assert.ok(bootstrap.includes("CREATE TABLE IF NOT EXISTS gameinfo_formula_presets"));
assert.ok(runtime.includes("ON gameinfo_formula_presets (updated_at DESC, id DESC)"));
assert.ok(bootstrap.includes("ON gameinfo_formula_presets (updated_at DESC, id DESC)"));
assert.ok(runtime.includes("CREATE TABLE IF NOT EXISTS gamelist_pack_column_registry"));
assert.ok(bootstrap.includes("CREATE TABLE IF NOT EXISTS gamelist_pack_column_registry"));
assert.ok(runtime.includes("ON gamelist_pack_column_registry (sort_order, column_key)"));
assert.ok(bootstrap.includes("ON gamelist_pack_column_registry (sort_order, column_key)"));

console.log("12 passed");
