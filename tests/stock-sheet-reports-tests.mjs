import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatCurrencyBag, stillToComeShare, supplierBalances } from "../src/lib/stock-supplier-balances.js";
import { mergeExpenseTabs, readExpenseTab, summarizeExpenses, UNCATEGORIZED } from "../src/lib/sheet-expenses.js";
import { mergeOffgamerTabs, offgamerAccount, orderNumber, readOffgamerList, readOffgamerTab, summarizeOffgamer } from "../src/lib/offgamer-cards.js";

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

// ---- 1.4: OffGamer cards ------------------------------------------------------------------
check(offgamerAccount("Offgamer Ptos") === "Ptos" && offgamerAccount("Offgamer List") === null && offgamerAccount("KBANK") === null, "an account tab is named Offgamer <owner>; the list tab is not an account");
check(orderNumber("4.6054901E7") === "46054901" && orderNumber("47418137") === "47418137" && orderNumber("") === "", "an order number typed as a number reads back as its digits");
const OG_HEADER = ["Date", "ORDER", "USDT ที่ได้รับ", "USDT ที่ออก", "USDT คงเหลือ", "ผู้สั่งซื้อ", "Serial", "PIN", "CHECK", "Expiry", "mail@x.com", "(ลบข้อมูลลับออก)"];
const older = readOffgamerTab("Offgamer Beer", rows([
  OG_HEADER,
  ["2026-06-01", "4.6054901E7", "938.3", "", "938.3", "FACE (TH)", "", "", "✅"],
  ["2026-06-01", "4.6054901E7", "", "469.15", "469.15", "FACE (TH)", "VABF45814185004488", "(ลบข้อมูลลับออก)", "✅", "46812.99998842592"],
  ["2026-06-01", "4.6054901E7", "", "469.15", "0", "FACE (TH)", "TBJD45814185004498", "(ลบข้อมูลลับออก)", "✅", "46812.99998842592"],
  ["2026-06-02", "46060000", "", "100", "0", "RIN", "SERIAL3", "(ลบข้อมูลลับออก)", "", ""],
]));
check(older.length === 2 && older[0].order === "46054901" && older[0].received === 938.3 && older[0].cards.length === 2, "older layout: the ORDER column ties the top-up and its cards together");
check(older[0].cards[0].serial === "VABF45814185004488" && older[0].cards[0].expiry === "2028-02-29" && older[0].cards[0].checked && older[1].received === 0, "a card keeps its serial, expiry and check mark; an order without its top-up row still counts");
check(!JSON.stringify(older).includes("ลบข้อมูลลับ"), "nothing from the dropped PIN column is carried into an order");
const NEW_HEADER = ["Date", "ORDER", "USDT ที่ได้รับ", "USDT ที่ออก", "USDT คงเหลือ", "ผู้สั่งซื้อ", "Serial", "PIN", "Expiry"];
const newer = readOffgamerTab("Offgamer Ptos", rows([
  NEW_HEADER,
  ["2026-10-01", "", "937.59", "", "937.59", "RIN", "ORDER # 47418137 (01 Oct 2026)"],
  ["2026-10-01", "", "", "468.795", "468.795", "RIN", "ELDP1"],
  ["2026-10-01", "", "", "468.795", "0", "RIN", "JVBR2"],
  ["2026-11-03", "", "469.4", "", "469.4", "BOMMY"],
  ["2026-11-03", "", "", "234.7", "234.7", "BOMMY", "GPDN3"],
  ["2026-11-03", "", "", "234.7", "0", "BOMMY", "XKFD4"],
  ["2026-11-03", "", "234.7", "", "234.7", "BOMMY"],
  ["2026-11-03", "", "", "234.7", "0", "BOMMY", "PKTF5"],
  ["", "", "", "", "0"],
]));
check(newer.length === 3 && newer[0].order === "47418137" && newer[0].cards.length === 2 && newer[0].cards.every((card) => card.serial !== "ORDER # 47418137 (01 Oct 2026)"), "newer layout: the order number comes from the top-up row's text, which is not a card");
check(newer[1].order === "" && newer[1].cards.length === 2 && newer[2].cards.length === 1 && newer[1].key !== newer[2].key, "each top-up row starts a new order even on the same day without a number");
const all = mergeOffgamerTabs([
  { tabId: 7, tab: "Offgamer Ptos", period: "2026-09", rows: rows([NEW_HEADER, ["2026-10-01", "", "937.59", "", "937.59", "RIN", "ORDER # 47418137"], ["2026-10-01", "", "", "468.795", "468.795", "RIN", "ELDP1"]]) },
  { tabId: 8, tab: "Offgamer Ptos", period: "2026-10", rows: rows([
    NEW_HEADER,
    ["2026-10-01", "", "937.59", "", "937.59", "RIN", "ORDER # 47418137 (01 Oct 2026)"],
    ["2026-10-01", "", "", "468.795", "468.795", "RIN", "ELDP1"],
    ["2026-10-01", "", "", "468.795", "0", "RIN", "JVBR2"],
    ["2026-11-03", "", "469.4", "", "469.4", "BOMMY"],
    ["2026-11-03", "", "", "234.7", "234.7", "BOMMY", "GPDN3"],
  ]) },
  { tabId: 9, tab: "Offgamer Ptos", period: "2026-09", rows: rows([NEW_HEADER, ["2026-11-03", "", "469.4", "", "469.4", "BOMMY"], ["2026-11-03", "", "", "234.7", "234.7", "BOMMY", "GPDN3"]]) },
]);
check(all.length === 2 && all.every((order) => order.tabId === 8) && all[1].spent === 937.59, "an order in two months' files is kept once, the newest file's copy, numbered or not");
const og = summarizeOffgamer(all);
check(og.totals.orders === 2 && og.totals.cards === 3 && og.accounts[0].account === "Ptos" && og.months.map((m) => m.month).join() === "2026-11,2026-10", "the summary counts orders and cards per account and per month, newest month first");
const accounts = readOffgamerList(rows([
  ["แนวทาง"],
  ["ลำดับ", "เมล", "พาส", "เจ้าของ บัญชี", "แรงค์", "NOTICE", "NOTICE"],
  ["1.0", "Inblackcs1@gmail.com", "(ลบข้อมูลลับออก)", "Beer", "Platinum Plus", "โดนระงับ 30 วัน", "46185.0"],
  ["2.0", "a@b.com", "(ลบข้อมูลลับออก)", "P'Pin", "Platinum", "", "Verification✅"],
  ["", "ไม่ใช่เมล"],
]));
check(accounts.length === 2 && accounts[0].notice === "โดนระงับ 30 วัน" && accounts[1].notice === "Verification✅" && !JSON.stringify(accounts).includes("ลบข้อมูลลับ"), "the account list keeps owner, rank and notices, never the password column");

// ---- pages ------------------------------------------------------------------------------
const nav = readFileSync(new URL("../src/components/stock-nav.js", import.meta.url), "utf8");
check(nav.includes('"/stock/offgamer"') && nav.includes('"/stock/expenses"'), "the Stock menu links the Multi Game Card and spending pages");
const po = readFileSync(new URL("../src/components/stock-purchase-orders.js", import.meta.url), "utf8");
check(po.includes("supplierBalances(orders)") && po.includes("ยอดค้างต่อซัพ"), "the purchase orders page shows what each supplier is owed");

console.log(`${passed} passed`);
