import assert from "node:assert/strict";
import {
  gameinfoColumnLooksBaht,
  gameinfoPackListColumns,
  gameinfoPriceChannelsWithColumn,
} from "@/lib/gameinfo-pack-list";

const computed = (key, label, extra = {}) => ({ id: `computed:${key}`, kind: "computed", label, computed: { key, label }, ...extra });
const columns = [
  computed("cost", "ต้นทุน"),
  computed("kaleoz", "ราคาขาย(KALEOZ)"),
  computed("russia", "ราคาRussia"),
  computed("g2g", "G2G"),
];
const shown = gameinfoPackListColumns(columns).channels;

// Picking a price on the game page turns the built-in channels into the game's own list.
const fromBuiltIn = gameinfoPriceChannelsWithColumn(shown, null, "kaleoz", "G2G");
assert.deepEqual(fromBuiltIn.map((channel) => channel.key), ["page", "kaleoz", "russia"], "the channels shown, keys kept");
assert.deepEqual(fromBuiltIn.map((channel) => channel.label), ["เพจ", "Kaleoz", "Russia"], "named as the bar names them");
assert.equal(fromBuiltIn[1].column, "G2G", "the picked channel takes the new column");
assert.equal(fromBuiltIn[2].column, "ราคาRussia", "the others keep the column they had, by its own name");
assert.equal(fromBuiltIn[0].column, "", "the page channel stays on the pack's price");

// A game with its own list changes only that channel.
const own = [{ key: "page", label: "เพจ", column: "" }, { key: "ch_x", label: "Itemku", column: "Itemku (บาท)" }];
const changed = gameinfoPriceChannelsWithColumn(shown, own, "page", "ราคาขาย(KALEOZ)");
assert.deepEqual(changed, [{ key: "page", label: "เพจ", column: "ราคาขาย(KALEOZ)" }, own[1]], "one channel changes, the rest as saved");
assert.equal(gameinfoPriceChannelsWithColumn(shown, own, "page", "").at(0).column, "", "back to the pack's price");

// Columns that are not baht are marked in the list.
assert.equal(gameinfoColumnLooksBaht(null), true, "the pack's price");
assert.equal(gameinfoColumnLooksBaht(computed("k", "ราคาขาย(KALEOZ)", { type: "number", symbol: "฿" })), true);
assert.equal(gameinfoColumnLooksBaht(computed("u", "ราคาUSD (PAGE)")), false, "USD in the name");
assert.equal(gameinfoColumnLooksBaht(computed("t", "Itemku (USDT)")), false, "USDT in the name");
assert.equal(gameinfoColumnLooksBaht(computed("i", "Itemku (IDR)")), false, "IDR in the name");
assert.equal(gameinfoColumnLooksBaht(computed("d", "G2G USD", { symbol: "$" })), false, "a dollar symbol");
assert.equal(gameinfoColumnLooksBaht(computed("p", "%กำไร", { symbol: "%" })), false, "a percent");
assert.equal(gameinfoColumnLooksBaht(computed("k5", "KALEOZ 5%", { type: "number", symbol: "฿" })), true, "a % in the name alone is still baht");
assert.equal(gameinfoColumnLooksBaht(computed("n", "หมายเหตุ", { type: "text" })), false, "text is no price");

console.log("16 passed");
