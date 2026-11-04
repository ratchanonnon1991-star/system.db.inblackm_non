import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildGameinfoPackListRows,
  filterGameinfoPackListRows,
  gameinfoListNumber,
  gameinfoMarginTone,
  gameinfoPackListColumns,
  summarizeGameinfoPackList,
} from "@/lib/gameinfo-pack-list";

const computed = (key, label, formula) => ({ id: `computed:${key}`, kind: "computed", label, computed: { key, label, formula } });
const columns = [
  { id: "name", kind: "base", label: "ชื่อ pack", field: "name" },
  computed("cost", "ต้นทุน", "[ราคา] * 0.7"),
  computed("kaleoz", "ราคาขาย(KALEOZ)", "[ราคา] + 5"),
  computed("itemku", "Itemku (IDR)", "[ราคา] * 500"),
];

const found = gameinfoPackListColumns(columns);
assert.equal(found.cost.id, "computed:cost", "the cost column is found by its name");
assert.deepEqual(found.channels.map((channel) => channel.key), ["page", "kaleoz"], "only channels whose price column exists are offered");

const currency = {
  id: "c",
  categories: [
    { id: "crystal", name: "CRYSTAL", packs: [{ id: "a", name: "60 Crystals", price: "20" }, { id: "b", name: "300 Crystals", price: "100" }] },
    { id: "pass", name: "PASS", packs: [{ id: "p", name: "Pass", price: "" }] },
  ],
};
const { rows, channels, costColumn } = buildGameinfoPackListRows(currency, columns, {}, {});
assert.equal(costColumn.id, "computed:cost");
assert.equal(rows.length, 3);
const first = rows[0];
assert.ok(Math.abs(first.cost - 14) < 1e-9, "cost comes from the ต้นทุน column");
assert.ok(Math.abs(first.channels.page.profit - 6) < 1e-9, "profit is the channel price less cost");
assert.ok(Math.abs(first.channels.page.margin - 30) < 1e-9, "margin is profit over the channel price");
assert.ok(Math.abs(first.channels.kaleoz.price - 25) < 1e-9, "a channel's price comes from its column");
assert.equal(rows[2].channels.page.price, null, "a pack without a price has no figures");
assert.equal(rows[2].channels.page.margin, null);
assert.deepEqual(channels.map((channel) => channel.key), ["page", "kaleoz"]);

assert.deepEqual(filterGameinfoPackListRows(rows, { chip: "pass" }).map((row) => row.pack.id), ["p"], "a category chip keeps its packs");
assert.deepEqual(filterGameinfoPackListRows(rows, { query: "300" }).map((row) => row.pack.id), ["b"], "search matches the pack name");
assert.deepEqual(filterGameinfoPackListRows(rows, { sort: "price" }).map((row) => row.pack.id), ["a", "b", "p"], "packs without a price sort last");

const summary = summarizeGameinfoPackList(rows, "page");
assert.equal(summary.count, 2, "only priced packs count");
assert.ok(Math.abs(summary.average - 30) < 1e-9);
assert.equal(summary.low, 0);

assert.equal(gameinfoMarginTone(25), "green");
assert.equal(gameinfoMarginTone(12), "amber");
assert.equal(gameinfoMarginTone(4), "red");
assert.equal(gameinfoMarginTone(null), "");
assert.equal(gameinfoListNumber("236155 X 2"), null, "a multiplied amount is text, not a number");
assert.equal(gameinfoListNumber("1,250"), 1250);

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const view = read("../src/components/gameinfo-game-view.js");
const list = read("../src/components/gameinfo-pack-list.js");
assert.ok(view.includes('useState("list")') && view.includes("ตารางเต็ม"), "the list is the default and the full table is one switch away");
assert.ok(list.includes('event.target.closest("a, button, input")'), "a row click leaves its links and buttons alone");
assert.ok(list.includes("aria-expanded={open}"), "each row's details open from a real button");

console.log("27 passed");
