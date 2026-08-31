import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cleanGameinfoNumericInput,
  findDuplicateGameinfoPackNamePrices,
  normalizeGameinfoNumericInput,
} from "../src/lib/gameinfo-pack-validation.js";

const numericCases = [
  ["00100", "100"],
  ["000", "0"],
  ["000.50", "0.50"],
  [".5", "0.5"],
  ["100.00", "100.00"],
  ["000001.2300", "1.23"],
  ["000.", "0"],
  ["00.001", "0"],
  ["0.123", "0.12"],
  ["0.126", "0.13"],
  ["", ""],
];
for (const [input, expected] of numericCases) {
  assert.equal(normalizeGameinfoNumericInput(input), expected, `normalizes ${input}`);
}
assert.equal(cleanGameinfoNumericInput("1a2b"), "12");
assert.equal(cleanGameinfoNumericInput("1.2.3"), "1.23");
assert.equal(cleanGameinfoNumericInput("฿ 001.25"), "001.25");

const tree = (packs) => [{ id: "c1", categories: [{ id: "cat1", packs }] }];
assert.deepEqual([...findDuplicateGameinfoPackNamePrices(tree([
  { id: "a", name: "Pack A", price: "00100" },
  { id: "b", name: " pack a ", price: "100" },
]))].sort(), ["a", "b"]);
assert.deepEqual([...findDuplicateGameinfoPackNamePrices(tree([
  { id: "a", name: "Pack A", price: "100.0" },
  { id: "b", name: "Pack A", price: "100.00" },
  { id: "c", name: "Pack A", price: "101" },
]))].sort(), ["a", "b"]);
assert.equal(findDuplicateGameinfoPackNamePrices(tree([
  { id: "a", name: "Pack A", price: "" },
  { id: "b", name: "Pack A", price: "" },
])).size, 0);
assert.equal(findDuplicateGameinfoPackNamePrices(tree([
  { id: "a", name: "ชื่อซ้ำ", price: "100" },
  { id: "b", name: "ชื่อซ้ำ", price: "200" },
])).size, 0, "duplicate names remain allowed when prices differ");
assert.equal(findDuplicateGameinfoPackNamePrices(tree([
  { id: "a", name: "Pack A", price: "100" },
  { id: "b", name: "Pack B", price: "100.00" },
])).size, 0, "duplicate prices remain allowed when names differ");
assert.deepEqual([...findDuplicateGameinfoPackNamePrices([
  { id: "c1", categories: [{ id: "cat1", packs: [{ id: "a", name: "Pack A", price: "50" }] }] },
  { id: "c2", categories: [{ id: "cat2", packs: [{ id: "b", name: "Pack A", price: "050.00" }] }] },
])].sort(), ["a", "b"], "duplicate name and price pairs are blocked across currencies and categories");

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const editor = read("../src/components/gameinfo-pack-editor.js");
const tags = read("../src/components/gameinfo-tags-input.js");
const view = read("../src/components/gameinfo-game-view.js");
const table = read("../src/components/gameinfo-gamelist-table.js");
const unsaved = read("../src/lib/gameinfo-unsaved-changes.js");
const themeRoot = read("../src/components/gameinfo-theme-root.js");

assert.ok(!editor.includes("window.confirm("), "pack actions do not use native confirm dialogs");
assert.ok(editor.includes("<GameinfoConfirmDialog"), "pack actions use the in-app confirmation dialog");
assert.ok(editor.includes("findDuplicateGameinfoPackNamePrices(currencies)"), "save validates duplicate name and price pairs");
assert.ok(editor.includes("normalizeGameinfoNumericInput(event.target.value)"), "numeric cells normalize on blur");
assert.ok(tags.includes("if (text.trim()) add(text)"), "typed tags commit when focus leaves the field");
assert.ok(!view.includes("<GameinfoRatePanel"), "user view hides the realtime exchange-rate panel");
assert.ok(view.includes("useGameinfoRates()"), "user formulas still receive exchange-rate inputs");
assert.ok(table.includes("<Trash2 size={14} />"), "game rows expose a visible delete action");
assert.ok(table.includes("aria-label={`ลบเกม"), "visible delete action has an accessible label");
assert.ok(unsaved.includes("GAMEINFO_NAVIGATION_REQUEST"), "internal dirty navigation requests an in-app dialog");
assert.ok(unsaved.includes("if (dirtySources.size === 0) return;"), "clean links navigate without an unnecessary dialog");
assert.ok(themeRoot.includes("<GameinfoUnsavedNavigationDialog />"), "the navigation dialog is mounted for GameInfo");

console.log("29 passed");
