import assert from "node:assert/strict";
import { filterGameinfoRows, isGameinfoBotAuto, listGameinfoPublishers, listGameinfoTags, summarizeGameinfoRows } from "../src/lib/gameinfo-dashboard.js";

const rows = [
  { id: 1, game: "Alpha", region: "TH", serviceStatus: "online", reportCount: 2, botManual: "BOT_AUTO", isFavorite: true, tags: ["RPG"], publishers: ["Garena"], priority: 1, web: { isActive: true } },
  { id: 3, game: "Gamma", region: "JP", serviceStatus: "offline", tags: ["Casual"], publishers: ["Riot Games"], priority: 3, web: { isActive: false } },
  { id: 2, game: "Beta", region: "TH", serviceStatus: "partial", tags: ["rpg", "Casual"], publishers: ["garena"] },
];

assert.deepEqual(summarizeGameinfoRows(rows), { all: 3, online: 1, review: 1, partial: 1, offline: 1, botAuto: 1, favorite: 1, priorityHigh: 1, webOn: 1, webOff: 1 });
assert.deepEqual(filterGameinfoRows(rows, { query: "th" }).map((row) => row.id), [1, 2]);
assert.deepEqual(filterGameinfoRows(rows, { status: "offline" }).map((row) => row.id), [3]);
assert.deepEqual(filterGameinfoRows(rows, { status: "review" }).map((row) => row.id), [1]);
assert.deepEqual(filterGameinfoRows(rows, { status: "bot-auto" }).map((row) => row.id), [1]);
assert.deepEqual(filterGameinfoRows(rows, { status: "favorite" }).map((row) => row.id), [1]);
assert.deepEqual(filterGameinfoRows(rows, { sort: "latest" }).map((row) => row.id), [3, 2, 1]);
assert.deepEqual(filterGameinfoRows(rows, { tag: "RPG" }).map((row) => row.id), [1, 2]);
assert.deepEqual(listGameinfoTags(rows), [{ name: "Casual", count: 2 }, { name: "RPG", count: 2 }]);
assert.deepEqual(filterGameinfoRows(rows, { publisher: "Garena" }).map((row) => row.id), [1, 2]);
assert.deepEqual(listGameinfoPublishers(rows), [{ name: "Garena", count: 2 }, { name: "Riot Games", count: 1 }]);
assert.deepEqual(filterGameinfoRows(rows, { status: "priority-high" }).map((row) => row.id), [3]);
assert.deepEqual(filterGameinfoRows(rows, { status: "web-on" }).map((row) => row.id), [1]);
// A game not linked to the website is neither ON nor OFF.
assert.deepEqual(filterGameinfoRows(rows, { status: "web-off" }).map((row) => row.id), [3]);
assert.deepEqual(filterGameinfoRows(rows, { sort: "priority" }).map((row) => row.id), [3, 1, 2]);
assert.equal(isGameinfoBotAuto("Bot Auto"), true);
assert.equal(isGameinfoBotAuto("Manual"), false);

console.log("17 passed");
