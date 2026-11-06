import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatCurrencyBag, stillToComeShare, supplierBalances } from "../src/lib/stock-supplier-balances.js";
import { mergeExpenseTabs, readExpenseTab, summarizeExpenses, UNCATEGORIZED } from "../src/lib/sheet-expenses.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const rows = (list) => list.map((cells, index) => ({ rowNo: index + 1, cells }));

// ---- 1.1: what each supplier is owed ------------------------------------------------------
const line = (qtyOrdered, qtyReceived = 0) => ({ itemId: 1, qtyOrdered, qtyReceived });
const balances = supplierBalances([
  { supplier: "YAYA", status: "approved", currency: "USDT", amount: 1000, rateThb: 33, lines: [line(10)], createdAt: "2026-11-01" },
  { supplier: "yaya", status: "partial", currency: "USDT", amount: 400, rateThb: 33, lines: [line(4, 1)], createdAt: "2026-11-02" },
  { supplier: "BAO", status: "refund_requested", currency: "CNY", amount: 500, refundAmount: 200, rateThb: null, lines: [line(5)], createdAt: "2026-10-01" },
  { supplier: "BAO", status: "received", currency: "USDT", amount: 900, rateThb: 33, lines: [line(9, 9)], createdAt: "2026-09-01" },
  { supplier: "Be", status: "cancelled", currency: "USDT", amount: 50, rateThb: 33, lines: [line(1)], createdAt: "2026-11-03" },
]);
const yaya = balances.find((row) => row.supplier === "YAYA");
check(balances.length === 3 && balances[0] === yaya, "a supplier's orders add up under one name whatever its case; the most owed comes first");
check(yaya.toPay.USDT === 1000 && yaya.toPayThb === 33000, "an approved, unpaid order is money still to pay");
check(yaya.goods.USDT === 300 && yaya.goodsThb === 9900 && yaya.openCount === 2, "a partly delivered order counts the paid share of the packs still to come");
const bao = balances.find((row) => row.supplier === "BAO");
check(bao.refund.CNY === 200 && bao.missingRate && bao.openCount === 1 && bao.bought.USDT === 900, "a refund counts what was asked back; an open order without a rate is flagged");
const be = balances.find((row) => row.supplier === "Be");
check(be.orderCount === 0 && !be.openCount && !Object.keys(be.bought).length, "a cancelled order owes nothing and is not counted as bought");
check(stillToComeShare({ lines: [] }) === 1 && stillToComeShare({ lines: [line(2, 5)] }) === 0, "no lines means all still to come; receiving more than ordered never goes below zero");
check(formatCurrencyBag({ USDT: 1200, THB: 0, CNY: 5 }) === "1,200 USDT · 5 CNY" && formatCurrencyBag({}) === "", "a bag of currencies reads as one line, zero amounts left out");

// ---- 1.3: everyday spending per category --------------------------------------------------
const HEADER = ["", "วันที่ทำรายการ", "เวลา", "ยอดเงินเข้า", "ยอดเงินออก", "ยอดเงินคงเหลือ", "ประเภทสินค้า ใช้จ่ายบริษัท", "รายการแยกย่อย", "ประเภทสินค้า สั่งซื้อ", "รายการแยกย่อย", "จำนวน", "ราคาต่อหน่วย", "ราคารวม", "ผู้ขาย", "ช่องทาง", "ชื่อบัญชีปลายทาง", "ผู้ซื้อ", "สถานะ", "KBank", "หมายเหตุ1"];
const bank = rows([
  ["ก่อนหัวตาราง", "2026-10-01", "", "999"],
  HEADER,
  ["0", "2026-10-01", "", "", "", "13057.27", "", "ยกยอดมา"],
  ["0", "2026-10-01", "20.4", "", "8,052.0", "5005.27", "ค่าใช้จ่ายบริษัท", "สวัสดิการพนักงาน", "", "", "", "", "", "ร้าน A", "", "", "RIN", "ชำระเรียบร้อย", "", "โน้ต"],
  HEADER,
  ["0", "2026-10-02", "13.33", "25000.0", "", "30005.27", "เงินสดเข้าบัญชี", "GSB INBLACK"],
  ["0", "2026-10-03", "", "", "70000", "-39994.73", "", "", "ค่าใช้จ่าย สั่งซื้อ", "True Wallet DAD"],
  ["0", "46298.0", "", "", "500", "1", "ค่าใช้จ่าย บริษัท", "ค่าน้ำ"],
  ["0", "2026-10-04", "", "", "", "1", "ค่าใช้จ่ายบริษัท", "ไม่มียอด"],
  ["0", "2026-10-05", "", "1335", "", "1", "", "เงินคืนค่าเสื้อ"],
]);
const entries = readExpenseTab("KBANK Paek", bank);
check(entries.length === 5, "rows before the first header, opening balances and rows with no money are left out");
check(entries[0].out === 8052 && entries[0].category === "ค่าใช้จ่ายบริษัท" && entries[0].detail === "สวัสดิการพนักงาน" && entries[0].seller === "ร้าน A" && entries[0].note === "โน้ต", "a spending row keeps its amount, category, detail, seller and note");
check(entries[2].category === "สั่งซื้อ · ค่าใช้จ่าย สั่งซื้อ" && entries[2].detail === "True Wallet DAD", "a purchase row takes the purchase category and its own detail column");
check(entries[3].date === "2026-10-03" && entries[4].category === UNCATEGORIZED, "an Excel day number is a date; a row without a category is marked so");
const merged = mergeExpenseTabs([
  { tabId: 1, tab: "KBANK Paek", period: "2026-09", entries: entries.slice(0, 2) },
  { tabId: 2, tab: "KBANK Paek", period: "2026-10", entries },
]);
check(merged.length === 5 && merged.every((entry) => entry.tabId === 2), "a row repeated in an older month's file is kept once, from the newest file");
const summary = summarizeExpenses(merged);
const october = summary.byMonth["2026-10"];
check(summary.months[0] === "2026-10" && october.out === 78552 && october.in === 26335, "a month adds up its money out and in");
const company = october.categories.find((c) => c.name === "ค่าใช้จ่ายบริษัท");
check(october.categories[0].name === "สั่งซื้อ · ค่าใช้จ่าย สั่งซื้อ" && company.out === 8552 && company.count === 2, "categories sort by money out; spellings that differ only by spaces are one category");

// ---- pages ------------------------------------------------------------------------------
const nav = readFileSync(new URL("../src/components/stock-nav.js", import.meta.url), "utf8");
check(!nav.includes("/stock/offgamer") && nav.includes('"/stock/expenses"'), "the Stock menu links the spending page; Multi Game Card lives in Topup Inventory");
const po = readFileSync(new URL("../src/components/stock-purchase-orders.js", import.meta.url), "utf8");
check(po.includes("supplierBalances(orders)") && po.includes("ยอดค้างต่อซัพ"), "the purchase orders page shows what each supplier is owed");

console.log(`${passed} passed`);
