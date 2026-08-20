import assert from "node:assert/strict";
import { filterGameinfoRows, summarizeGameinfoRows } from "../src/lib/gameinfo-dashboard.js";

const rows = [
  { id: 1, game: "Alpha", region: "TH", serviceStatus: "online" },
  { id: 3, game: "Gamma", region: "JP", serviceStatus: "offline" },
  { id: 2, game: "Beta", region: "TH", serviceStatus: "partial" },
];

assert.deepEqual(summarizeGameinfoRows(rows), { all: 3, online: 1, partial: 1, new: 0, offline: 1 });
assert.deepEqual(filterGameinfoRows(rows, { query: "th" }).map((row) => row.id), [1, 2]);
assert.deepEqual(filterGameinfoRows(rows, { status: "offline" }).map((row) => row.id), [3]);
assert.deepEqual(filterGameinfoRows(rows, { sort: "latest" }).map((row) => row.id), [3, 2, 1]);

console.log("4 passed");
