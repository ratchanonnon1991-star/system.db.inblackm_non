import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../src/server/gameinfo-gamelist-packs.js", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../db-init/004-schema-topup-inblackm.sql", import.meta.url), "utf8");
const expected = "ON gamelist_pack_view_presets (game_id, user_id, surface, name)";

assert.ok(runtime.includes(expected));
assert.ok(bootstrap.includes(expected));
assert.ok(runtime.includes("DROP INDEX IF EXISTS gamelist_pack_view_presets_game_user_name"));
assert.ok(bootstrap.includes("DROP INDEX IF EXISTS gamelist_pack_view_presets_game_user_name"));

console.log("4 passed");
