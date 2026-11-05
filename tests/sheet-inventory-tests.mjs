import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planSheetInventory, readPurchaseList, sheetInventoryMoves, sheetStockCode, supplierOfTab, tierLabel } from "../src/lib/sheet-inventory.js";
import { STOCK_RESERVED_CODES } from "../src/lib/stock.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const rows = (list) => list.map((cells, index) => ({ rowNo: index + 1, cells }));
const header = ["CHECK", "Date", "GAME", "Stock ID", "PRODUCT", "", "", "", "", "", "Total USD", "Product Rate", "CNY Rate", "TOTAL", "ยอดรวม ทุกรายการ", "ลิงค์ใบเสร็จ", "paid"];
const packs = ["", "", "", "", "Pack", "Amount", "Price", "Pack", "Amount", "Price"];

check(supplierOfTab("1.รายการสั่งซื้อ Stock iOS (yay") === "YAYA" && supplierOfTab("2.รายการสั่งซื้อ Stock iOS (BAO") === "BAO"
  && supplierOfTab("4.รายการสั่งซื้อ Stock iOS (ฺT0") === "T002" && supplierOfTab("3.รายการสั่งซื้อ Stock iOS (ฺBe") === "Be" && supplierOfTab("KBANK MOM") === null, "the purchase lists name their supplier");
check(sheetStockCode("EFOOTBALL", "") === "pes1" && sheetStockCode("Pokemon Go", "poekgo") === "pokego" && sheetStockCode("Wuthering Waves", "Wuthering01") === "wuthering01"
  && sheetStockCode("EFOOTBALL", "pes2") === "pes2" && sheetStockCode("Unknown", "") === "", "a row's stock ID: as typed (spelling fixed), else its game's");
check(tierLabel(10) === "10 USD" && tierLabel(4.8) === "4.8 USD" && tierLabel(19.99) === "19.99 USD", "a pack is named by its price");

const list = readPurchaseList(rows([
  header, packs,
  ["0", "2026-08-08", "EFOOTBALL", "pes1", "1.2", "100.0", "120", "1480", "5.4", "6.68", "1486.68", "5.4", "6.68", "1201.807186", "", "", ""],
  header, packs,
  ["0", "2026-08-11", "EFOOTBALL", "pes1", "50.0", "1.2", "60", "", "", "0", "60", "5.45", "6.68", "48.95", "", "https://x/r.png", ""],
  ["0", "2026-08-12", "0", "", "", "", "0"],
]));
check(list.orders.length === 2 && list.orders[0].lines.length === 1 && list.orders[0].lines[0].qty === 100 && list.orders[0].usdt === 1201.807186, "a slot holding the order's totals is skipped, not read as a pack");
check(list.orders[1].lines[0].price === 1.2 && list.orders[1].lines[0].qty === 50 && list.orders[1].receiptUrl === "https://x/r.png", "Pack and Amount typed the other way round are swapped back");
check(list.problems.length === 1, "the skipped slot is reported");

const purchase = (period, date, qty) => ({
  period, fileName: `1.1 บัญชีสั่งซื้อสินค้า ${period}`, tab: "1.รายการสั่งซื้อ Stock iOS (yay",
  rows: rows([header, packs, ["0", date, "EFOOTBALL", "pes1", "4.8", String(qty), String(4.8 * qty), "", "", "0", String(4.8 * qty), "5", "6.5", "10", "", "", ""]]),
});
const countTab = (id, period, name, qty) => ({
  tab: { id, period, fileName: `1.4 Cash Flow ${Number(period.slice(5))}_2026`, tab: name },
  rows: rows([["Stock", "", "คงเหลือ", "ต้นทุน", "รวม ( THB )", "", "Stock", "", "ชื่อแพ็ค", "ราคา", "คงเหลือ", "ต้นทุน", "รวม ( THB )"],
    ["", "Razer", "1", "1", "1", "", "", "Efootball", "550 Coin", "4.8", String(qty), "25", "1"]]),
});
const plan = planSheetInventory({
  purchaseTabs: [purchase("2026-02", "2026-01-31", 20), purchase("2026-01", "2026-01-31", 20), purchase("2026-01", "2026-01-10", 50)],
  countTabs: [countTab(9, "2026-01", "1712026", 40)],
});
check(plan.events.filter((event) => event.type === "order").length === 2, "a row the next month's file repeats is kept once");
check(plan.events.find((event) => event.when.startsWith("2026-01-31")).sheet.period === "2026-01", "the kept row points at the file it was typed in");
check(plan.accounts[0].code === "pes1" && plan.accounts[0].items[0].label === "4.8 USD" && plan.accounts[0].items[0].packName === "550 Coin", "a tier takes the Cash Flow pack names");
const { moves, balances } = sheetInventoryMoves(plan.events);
check(moves.map((move) => move.kind).join() === "in,adjust,in" && moves[1].lines[0].qty === -10 && balances.pes1["4.8 USD"] === 60, "orders are receipts; a count corrects to what was counted; later orders add on");

const repository = readFileSync(new URL("../src/server/sheet-inventory-repository.js", import.meta.url), "utf8");
check(repository.includes("created_by_id IS NULL") && repository.includes("actor_id IS NULL") && !/DELETE FROM stock_accounts|DELETE FROM stock_items/.test(repository), "a re-run replaces only the importer's own orders and moves; IDs and packs are never deleted");
check(STOCK_RESERVED_CODES.includes("sheet-stock"), "a stock ID cannot hide the คลังตามชีต page");

console.log(`sheet inventory: ${passed} passed`);
