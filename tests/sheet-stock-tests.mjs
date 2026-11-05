import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupStockCounts, isStockTab, readStockCount, stockCountDate, stockTotals, withStockChanges } from "../src/lib/sheet-stock.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const rows = (list) => list.map((cells, index) => ({ rowNo: index + 1, cells }));

check(isStockTab({ fileName: "1.4 Cash Flow 4_2026", tab: "2542026" }) && isStockTab({ fileName: "1.2 บัญชีแลกเงิน 10_2026", tab: "Cash Flow" })
  && isStockTab({ fileName: "Stock to THB", tab: "Sheet1" }) && !isStockTab({ fileName: "1.2 บัญชีแลกเงิน 10_2026", tab: "Bybit Inblack Gaming" }), "Cash Flow and Stock to THB tabs hold stock counts");
check(stockCountDate({ fileName: "1.4 Cash Flow 4_2026", tab: "2542026", period: "2026-04" }).date === "2026-04-25"
  && stockCountDate({ fileName: "1.4 Cash Flow 1_2026", tab: "512026", period: "2026-01" }).date === "2026-01-05"
  && stockCountDate({ fileName: "1.4 Cash Flow 1_2026", tab: "3112026", period: "2026-01" }).date === "2026-01-31"
  && stockCountDate({ fileName: "1.2 x", tab: "Cash Flow", period: "2026-10" }).date === null, "a 1.4 tab's name is its count date; other tabs have none");

// Two blocks side by side; a header for the right block sits on a row that still has left-block data.
const items = readStockCount(rows([
  ["Stock", "", "คงเหลือ", "ยังไม่ได้รับ", "ต้นทุน", "รวม ( THB )", "", "Stock ( เก่า )", "", "ชื่อแพ็ค", "ราคา", "คงเหลือ", "ต้นทุน", "รวม ( THB )"],
  ["", "RAZER GOLD ( CAD )", "11540.32", "5000.0", "19.906", "329251.6099", "", "", "Wuthering", "Spacetrek", "20.0", "5.0", "24.057", "2405.7"],
  ["", "Moniepoint ( NGN )", "2.9696544E7", "0.0", "0.0237", "703808.0928", "", "Stock", "", "ชื่อแพ็ค", "ราคา", "คงเหลือ", "ต้นทุน", "รวม ( THB )"],
  ["", "", "", "", "ยอดรวม", "1033059.7027", "", "", "Last war", "5 USD", "5.0", "55.0", "26.651", "7329.025"],
  [],
  ["", "รายการยอดค้าง", "USDT", "USDT : THB", "THB"],
  ["", "Russia Reseller", "15852.3", "33.638", "533239.6674"],
  [],
  ["", "ยอดเงิน", "ยอดคงเหลือ", "เรท", "THB"],
  ["", "Bitkub", "50000.0", "33.638", "1681900"],
]));
const named = (name) => items.find((item) => item.name === name);
check(named("RAZER GOLD ( CAD )").qty === 11540.32 && named("RAZER GOLD ( CAD )").pending === 5000 && named("RAZER GOLD ( CAD )").group === "balance", "a balance keeps its count, what is not yet received, cost and THB");
check(named("Moniepoint ( NGN )")?.qty === 29696544, "a row carrying another block's header keeps its own data");
check(named("Wuthering").pack === "Spacetrek" && named("Wuthering").price === 20 && named("Wuthering").group === "pack" && named("Last war").pack === "5 USD", "packs keep their pack name and price, across a repeated header");
check(!items.some((item) => /ยอดรวม/.test(item.name)) && named("Russia Reseller").group === "owed" && named("Russia Reseller").qty === 15852.3 && named("Bitkub").group === "money", "totals are skipped; money owed and money in accounts are their own groups");
const totals = stockTotals(items);
check(Math.round(totals.balance) === 1033060 && Math.round(totals.owed) === 533240, "totals add up each group's THB");

const repeated = readStockCount(rows([["IOS Stock to THB"], ["", "ยอดคงเหลือ", "discount", "THB"], ["ZZZ", "200", "5.0", "5038"], [], ["", "ยอดคงเหลือ", "discount", "THB"], ["ZZZ", "200", "4.7", "4735"]]));
check(repeated.length === 1 && repeated[0].thb === 4735, "a table typed twice counts its later copy once");

const tab = (id, period, fileName, name) => ({ id, period, fileName, tab: name });
const jan = [{ group: "balance", name: "Razer", pack: "", qty: 10 }, { group: "balance", name: "TNT", pack: "", qty: 5 }];
const counts = withStockChanges(groupStockCounts([
  { tab: tab(1, "2026-01", "1.4 Cash Flow 1_2026", "512026"), items: jan },
  { tab: tab(2, "2026-01", "1.4 Cash Flow 1_2026", "3112026"), items: [{ group: "balance", name: "Razer", pack: "", qty: 4 }] },
  { tab: tab(3, "2026-01", "1.2 บัญชีแลกเงิน 1_2026", "Cash Flow"), items: jan },
  { tab: tab(4, "2026-02", "1.2 บัญชีแลกเงิน 2_2026", "Cash Flow"), items: jan },
  { tab: tab(5, "2026-08", "Stock to THB", "Sheet1"), items: [{ group: "balance", name: "Razer", pack: "", qty: 99 }] },
]));
check(counts.length === 3 && counts[0].copiedIn.length === 2, "a monthly tab that repeats a dated count is folded into that count");
check(counts[1].items[0].change === -6 && counts[1].previousKey === "1" && counts[2].items[0].change === null && counts[2].previousKey === null, "changes compare with the same table's previous count only");

const page = readFileSync(new URL("../src/app/stock/sheet-stock/page.js", import.meta.url), "utf8");
check(!/INSERT|UPDATE|DELETE/i.test(page) && page.includes("listSheetStockCounts"), "the page only reads");

console.log(`sheet stock: ${passed} passed`);
