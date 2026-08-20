import assert from "node:assert/strict";
import { normalizeGamelistFavorite } from "../src/server/gameinfo-gamelist-favorites.js";

assert.equal(normalizeGamelistFavorite(true), true);
assert.equal(normalizeGamelistFavorite(false), false);
assert.throws(() => normalizeGamelistFavorite("true"), /ไม่ถูกต้อง/);

console.log("3 passed");
