import assert from "node:assert/strict";
import {
  GAMEINFO_HISTORY_LIMIT,
  getGameinfoReturnHref,
  normalizeGameinfoHistoryStack,
  updateGameinfoHistoryStack,
} from "../src/lib/gameinfo-navigation-history.js";

assert.deepEqual(normalizeGameinfoHistoryStack(null), []);
assert.deepEqual(normalizeGameinfoHistoryStack(["/", "/gameinfo/th", 7]), ["/gameinfo/th"]);
assert.deepEqual(updateGameinfoHistoryStack([], "/gameinfo/th"), ["/gameinfo/th"]);
assert.deepEqual(updateGameinfoHistoryStack(["/gameinfo/th"], "/gameinfo/th"), ["/gameinfo/th"]);
assert.deepEqual(
  updateGameinfoHistoryStack(["/gameinfo/th", "/gameinfo/th/7"], "/gameinfo/th"),
  ["/gameinfo/th"],
  "returning to the previous route pops instead of creating a loop"
);
assert.deepEqual(
  updateGameinfoHistoryStack(["/gameinfo/th", "/gameinfo/th/7"], "/gameinfo/th/7/manage?mode=idpass"),
  ["/gameinfo/th", "/gameinfo/th/7", "/gameinfo/th/7/manage?mode=idpass"]
);
assert.equal(
  getGameinfoReturnHref(["/gameinfo/th", "/gameinfo/th/7", "/gameinfo/th/7/manage"], "/fallback"),
  "/gameinfo/th/7"
);
assert.equal(getGameinfoReturnHref(["/gameinfo/th/7"], "/gameinfo/th"), "/gameinfo/th");
const longStack = Array.from({ length: GAMEINFO_HISTORY_LIMIT + 5 }, (_, index) => `/gameinfo/th/${index}`);
assert.equal(normalizeGameinfoHistoryStack(longStack).length, GAMEINFO_HISTORY_LIMIT);

console.log("9 passed");
