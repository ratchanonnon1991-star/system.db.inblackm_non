import assert from "node:assert/strict";
import {
  accountSheetCoverage,
  excelDate,
  parseWalletTab,
  planWalletEntries,
  readableSheetRows,
  REMOVED_CELL,
  scrubSheetRows,
  sheetFileKind,
  sheetMinutes,
  linkSupplierReceipts,
  sheetPeriod,
  supplierName,
  supplierReceipts,
  walletCodeForTab,
  isFrozenWallet,
} from "../src/lib/account-sheets.js";
import { fromWalletUnits } from "../src/lib/stock-wallets.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

check(sheetPeriod("ข้อมูลบัญชี 10-2026") === "2026-10" && sheetPeriod("ข้อมูลบัญชี 1-2026") === "2026-01" && sheetPeriod("อื่น ๆ") === null, "a month folder gives its period");
check(sheetFileKind("1.2 บัญชีแลกเงิน 10_2026.xlsx") === "1.2 บัญชีแลกเงิน" && sheetFileKind("1.4 Multi Game Card") === "1.4 Multi Game Card", "the month drops out of a workbook's name");
check(walletCodeForTab("1.2 บัญชีแลกเงิน 10_2026", "BITKUB INBLACK") === "bitkub" && walletCodeForTab("1.2 x", "Bitazza Inblack") === "bitazza"
  && walletCodeForTab("1.2 x", "BITKUB PAek") === null && walletCodeForTab("1.1 x", "Bybit Inblack Gaming") === null, "only the three wallet tabs of 1.2 feed wallets");
check(walletCodeForTab("1.3 บัญชีใช้จ่ายทั่วไป 10_2026", "KBANK P'aek") === "kbank-paek" && walletCodeForTab("1.3 x", "KBANK P’aek") === "kbank-paek"
  && walletCodeForTab("1.3 x", "kbank  paek") === "kbank-paek", "a tab name matches with or without its apostrophe");
check(excelDate("46296") === "2026-10-01" && excelDate("123") === null && excelDate("abc") === null, "day serials become dates, other numbers do not");
check(sheetMinutes("9.4") === 580 && sheetMinutes("10.19") === 619 && sheetMinutes("0.5") === 720 && sheetMinutes("21:51:") === 1311 && sheetMinutes("") === null, "the time column reads hour.minute, day fractions and text");

const scrubbed = scrubSheetRows([
  ["Date", "inblackgaming@gmail.com", "Secret5713@", "x@y.com", "1234.5"],
  ["Code", "PIN"],
  ["ABC", "0042"],
  ["", "", "a@b.co", "has space"],
]);
check(scrubbed.rows[0][2] === REMOVED_CELL && scrubbed.rows[0][4] === "1234.5", "a login right after an e-mail is dropped; a number after one is kept");
check(scrubbed.rows[2][1] === REMOVED_CELL && scrubbed.rows[2][0] === REMOVED_CELL && scrubbed.rows[3][3] === "has space", "PIN and Code columns are dropped below their header; text with spaces stays");
check(scrubbed.removed === 3, "dropped cells are counted");

const readable = readableSheetRows([["", "Date", "time", "รายการ"], ["", "46296", "0.5", "BITKUB"]]);
check(readable[1][1] === "2026-10-01" && readable[1][2] === "12:00" && readable[1][3] === "BITKUB", "date and time columns are shown as such");

// A Bybit tab: carried balance, a deposit, a payment with fee, a USDT → BTC exchange.
const bybitHeader = ["", "Date", "time", "MMK In", "", "", "", "", "", "", "", "", "USDT ที่ได้", "USDT ที่ใช้", "USDT FEE", "USDT ที่ใข้ (รวม)", "USDT คงเหลือ",
  "BTC ที่ได้", "BTC ที่ใช้", "BTC FEE", "BTC ที่ใข้ (รวม)", "BTC คงเหลือ", "สถานะ", "หมายเหตุ 1"];
const row = (date, time, desc, cells) => { const r = ["", date, time, desc]; for (const [col, value] of Object.entries(cells)) r[col] = value; return r; };
const bybit = parseWalletTab("bybit", [
  bybitHeader,
  row("", "", "ย้ายยอด", { 12: "100", 16: "100", 21: "0" }),
  row("46296", "9.4", "BITKUB", { 12: "50", 16: "150", 22: "เรียบร้อย" }),
  row("46296", "10.1", "Razer", { 13: "20", 14: "1", 15: "21", 16: "129" }),
  bybitHeader.map((cell) => (cell === "USDT ที่ได้" ? "" : cell)), // a repeated header missing a label
  row("46297", "11.0", "Convert USDT To BTC", { 13: "29", 16: "100", 17: "0.0003", 21: "0.0003" }),
  row("46297", "11.3", "Deposit again", { 12: "5", 16: "105" }),
], "2026-10");
check(bybit.records.length === 5 && bybit.records[0].opening, "the carried balance and every money row are read");
check(fromWalletUnits(bybit.records[4].moves.USDT.in) === "5", "a column missing from a repeated header keeps the earlier one");

const bitkub = parseWalletTab("bitkub", [
  ["", "Date", "time", "รายการใช้จ่าย", "Order", "BITKUB ( THB เข้า )", "BITKUB ( THB ออก )", "BITKUB ( THB คงเหลือ)", "USDT RATE", "USDT FEE fee 0.25 %",
    "USDT เข้า ( สูตร )", "USDT เข้า ( manual )", "USDT ออก", "USDT FEE", "USDT คงเหลือ", "สถานะ"],
  ["", "", "", "", "", "", "", "0", "", "", "", "50", "", "", "50"], // unnamed first row = carried balance
  ["", "46296", "9.39", "ย้ายเข้า ByBit Inblack", "", "", "", "0", "", "", "", "", "49.99", "0.01", "0"],
  ["", "46296", "12.0", "ฝากเงินเข้าระบบ", "", "1000", "", "1000", "", "", "", "", "", "", "0"],
], "2026-10");
check(bitkub.records[0].opening && bitkub.records.length === 3, "an unnamed first money row is the carried balance");

// The Bybit deposit "BITKUB" of 50 is not the BITKUB transfer of 49.99, so both stay as they are.
const plan = planWalletEntries([
  { code: "bitkub", period: "2026-10", tab: "BITKUB INBLACK", records: bitkub.records },
  { code: "bybit", period: "2026-10", tab: "Bybit Inblack Gaming", records: bybit.records },
]);
const kinds = plan.entries.map((entry) => entry.kind);
check(kinds.filter((kind) => kind === "adjust").length === 2, "first carried balances become two opening corrections");
check(kinds.includes("exchange") && plan.entries.find((entry) => entry.kind === "exchange").legs.map((leg) => leg.currency).join() === "USDT,BTC", "USDT out and BTC in on one row is an exchange");
check(plan.totals["bybit:USDT"] === "105" && plan.totals["bitkub:USDT"] === "0" && plan.totals["bitkub:THB"] === "1000", "balances follow the sheet");
check(plan.mismatches.length === 0, "a sheet that adds up needs no correction");

// A transfer: BITKUB pays 49.99 + 0.01 fee, Bybit receives 49.99 the same day.
const transfer = planWalletEntries([
  { code: "bitkub", period: "2026-10", tab: "BITKUB INBLACK", records: [{ ...bitkub.records[1] }] },
  { code: "bybit", period: "2026-10", tab: "Bybit Inblack Gaming", records: [{ rowNo: 9, date: "2026-10-01", minutes: 585, desc: "BITKUB", order: "", status: "", note: "", opening: false,
    moves: { USDT: { in: 4999000000n, out: 0n, fee: 0n } }, balances: {} }] },
]);
const moved = transfer.entries.filter((entry) => entry.kind === "transfer");
check(moved.length === 1 && moved[0].legs.length === 2 && !transfer.entries.some((entry) => ["deposit", "payment"].includes(entry.kind)), "an out of one wallet and the matching in of another become one transfer");

// Rows a month's file repeats from the next file are left to the next file.
const overlap = planWalletEntries([
  { code: "bybit", period: "2026-09", tab: "Bybit", records: [
    { rowNo: 4, date: "2026-09-01", minutes: 0, desc: "ย้ายยอด", opening: true, moves: {}, balances: { USDT: 1000000000n } },
    { rowNo: 5, date: "2026-10-01", minutes: 60, desc: "x", order: "", status: "", note: "", opening: false, moves: { USDT: { in: 0n, out: 100000000n, fee: 0n } }, balances: {} },
  ] },
  { code: "bybit", period: "2026-10", tab: "Bybit", records: [
    { rowNo: 4, date: "2026-10-01", minutes: 0, desc: "ย้ายยอด", opening: true, moves: {}, balances: { USDT: 1000000000n } },
    { rowNo: 5, date: "2026-10-01", minutes: 60, desc: "x", order: "", status: "", note: "", opening: false, moves: { USDT: { in: 0n, out: 100000000n, fee: 0n } }, balances: { USDT: 900000000n } },
  ] },
]);
check(overlap.overlap === 1 && overlap.totals["bybit:USDT"] === "9" && overlap.mismatches.length === 0, "a row in both files counts once");

const coverage = accountSheetCoverage([
  { period: "2026-09", fileKind: "1.2 บัญชีแลกเงิน", tab: "BITKUB INBLACK", rowCount: 10, walletCode: "bitkub" },
  { period: "2026-10", fileKind: "1.2 บัญชีแลกเงิน", tab: "BITKUB INBLACK", rowCount: 5, walletCode: "bitkub" },
  { period: "2026-10", fileKind: "1.3 บัญชีใช้จ่ายทั่วไป", tab: "KBANK Paek", rowCount: 7, walletCode: null },
]);
check(coverage.length === 2 && coverage[0].rows === 15 && coverage[0].page && !coverage[1].page, "coverage groups a tab across months and says which have a page");

// A login typed beside an account's name on the header row is dropped; the labels stay.
const header = scrubSheetRows([["", "Date", "time", "TNT Hero", "Hero5713", "PHP ที่ได้รับ", "Ayetun786#"], ["", "46296", "", "x", "Hero5713"]]);
check(header.rows[0][4] === REMOVED_CELL && header.rows[0][6] === REMOVED_CELL && header.rows[0][3] === "TNT Hero" && header.rows[0][5] === "PHP ที่ได้รับ", "logins on a header row are dropped, labels kept");
check(header.rows[1][4] === "Hero5713" && header.removed === 2, "only header rows are scanned for logins");
check(scrubSheetRows([["Password"], ["abc"], [""]]).rows[1][0] === REMOVED_CELL && scrubSheetRows([["Password"], ["abc"], [""]]).rows[2][0] === "", "a Password column is dropped, empty cells stay empty");

// Secondary wallet tabs (ledger layout).
check(walletCodeForTab("1.2 x", "MYR ( Plsbuy )") === "myr-plsbuy" && walletCodeForTab("1.2 x", "BITKUB PTos") === "bitkub-ptos" && walletCodeForTab("1.2 x", "TNT Hero", ["bybit"]) === null, "secondary tabs map to their wallet, and a code list narrows it");
const myr = parseWalletTab("myr-plsbuy", [
  ["", "Date", "time", "TOP UP MAIL", "MYR ที่ได้รับ", "MYR ที่จ่าย", "MYR คงเหลือ", "Link"],
  ["", "46200", "", "old copied row", "", "10", "90", ""], // last months' row under its old date
  ["", "46296", "9.0", "a@b.co", "", "15", "85", "https://img/1"],
  ["", "46297", "10.3", "deposit", "40", "", "125", ""],
], "2026-10");
check(myr.records.length === 3 && myr.records[0].opening && fromWalletUnits(myr.records[0].balances.MYR) === "100", "a ledger tab starting on a money row gets its carried balance from that row");
check(!myr.records.some((record) => record.desc === "old copied row") && myr.problems.length === 0, "rows carried along under last months' dates are left out");
check(myr.records[1].desc === "a@b.co" && myr.records[1].details.some((d) => d.label === "Link" && d.value === "https://img/1"), "the description column and proof links are kept");
const myrPlan = planWalletEntries([{ code: "myr-plsbuy", period: "2026-10", tab: "MYR ( Plsbuy )", records: myr.records }]);
check(myrPlan.totals["myr-plsbuy:MYR"] === "125" && myrPlan.mismatches.length === 0, "a secondary wallet ends where its sheet ends");
const idr = parseWalletTab("idr-amen", [
  ["", "Date", "time", "TOP UP NUMBER", "IDR ที่ได้รับ", "IDR ที่จ่าย", "PHP คงเหลือ"],
  ["", "", "", "ยอดยกมา", "", "", "1000"],
  ["", "46296", "", "0812", "", "300", "700"],
], "2026-10");
check(idr.records.length === 2 && idr.records[0].opening && fromWalletUnits(idr.records[1].balances.IDR) === "700", "IDR Amen reads its balance from the column the sheet calls PHP คงเหลือ");

check(scrubSheetRows([["Date", "knnr@gmail.com Navaphol123"]]).rows[0][1] === `knnr@gmail.com ${REMOVED_CELL}` && scrubSheetRows([["x@y.co ลด 12%"]]).rows[0][0] === "x@y.co ลด 12%", "a password after an e-mail in the same cell is dropped; plain words stay");
const uah = parseWalletTab("google-uah", [
  ["", "Date", "USDT ที่ได้รับ", "UAH ที่ได้ชำระ", "Pruduct RATE", "FEE", "UAH ที่จ่าย", "UAH ที่ได้รับ", "UAH RATE", "FEE", "UAH คงเหลือ", "TOP UP MAIL"],
  ["", "46177", "", "", "", "", "0", "0", "", "", "0.0", "ยกยอดมา"],
  ["", "46177", "2000", "", "", "", "0", "84380.95238", "44.3", "1.05", "84380.95238", ""],
  ["", "46177", "", "34380", "44.3", "1.05", "814.8758465", "0", "", "", "50000.95238", "Raif (UAH) NP 7"],
], "2026-06");
check(fromWalletUnits(uah.records[2].moves.UAH.out) === "34380" && planWalletEntries([{ code: "google-uah", period: "2026-06", tab: "Google UAH", records: uah.records }]).checks[0].drifts.length === 0, "Google UAH spends what ที่ได้ชำระ says, not the USDT cost in ที่จ่าย");
// A payment ties to the supplier row that received it.
check(supplierName("Order (Miles)") === "miles" && supplierName("Order STOCK(YAYA)") === "yaya" && supplierName("Cash Flow") === null, "a supplier is named in brackets");
const miles = supplierReceipts("1.2 บัญชีแลกเงิน 10_2026", "Order (Miles)", [
  ["CHECK Amount", "Date", "USDT ที่ได้รับ", "RAZER USD ที่ได้ชำระ"],
  ["", "46296", "2568.0", ""],
  ["", "46296", "", "300"],
], "2026-10");
check(miles.length === 1 && miles[0].rowNo === 2 && fromWalletUnits(miles[0].amount) === "2568" && miles[0].date === "2026-10-01", "a supplier tab lists the rows where it received USDT");
check(supplierReceipts("1.2 x", "Bybit Inblack Gaming", [["Date", "USDT ที่ได้รับ"], ["46296", "5"]], "2026-10").length === 0 && supplierReceipts("1.1 x", "Order (Miles)", [["Date", "USDT ที่ได้รับ"], ["46296", "5"]], "2026-10").length === 0, "wallet tabs and other files are not supplier tabs");
const pays = [
  { kind: "payment", title: "ITunes Miles", occurredAt: "2026-10-01T15:00:00+07:00", legs: [{ currency: "USDT", amount: -256815000000n, fee: 15000000n }] },
  { kind: "payment", title: "ITunes Miles", occurredAt: "2026-10-09T15:00:00+07:00", legs: [{ currency: "USDT", amount: -256815000000n, fee: 15000000n }] },
  { kind: "payment", title: "ITunes T002", occurredAt: "2026-10-01T15:00:00+07:00", legs: [{ currency: "USDT", amount: -256815000000n, fee: 15000000n }] },
];
check(linkSupplierReceipts(pays, miles) === 1 && pays[0].receivedAt.tab === "Order (Miles)" && pays[0].receivedAt.rowNo === 2, "same amount less fee, named supplier, within 3 days");
check(!pays[1].receivedAt && !pays[2].receivedAt, "a row is used once; another supplier's payment is not tied to it");
// Card numbers and gift-card codes never reach the archive.
const cards = scrubSheetRows([
  ["Icloud", "เบอร์ที่ผูก", "cvv", "Order"],
  ["Mangoseekew", "088-756-3989", "", "4111111111111112"],
  ["x", "4111 1111 1111 1111 05-30", "123", "47418137"],
  ["Note: card 4111-1111-1111-1111", "1234567812345670", "", ""],
]);
check(cards.rows[2][1] === REMOVED_CELL && cards.rows[2][2] === REMOVED_CELL && cards.rows[1][1] === "088-756-3989", "a grouped card number and everything under a cvv header go; phone numbers stay");
check(cards.rows[3][0] === REMOVED_CELL && cards.rows[3][1] === REMOVED_CELL && cards.rows[1][3] === "4111111111111112" && cards.rows[2][3] === "47418137", "a Luhn-valid 16-digit run goes; other order numbers stay");
const codes = scrubSheetRows([["วันที่ซื้อ", "Code", "ยอดบัตร GARENA", "Code Bitcash"], ["46057", "7276473075421307", "350", "ABCD-EFGH"]]);
check(codes.rows[1][1] === REMOVED_CELL && codes.rows[1][3] === REMOVED_CELL && codes.rows[1][2] === "350", "gift-card Code columns go, amounts stay");
// Bank tabs of 1.3 and frozen tabs (2026-11-05).
check(walletCodeForTab("1.3 บัญชีใช้จ่ายทั่วไป 10_2026", "KBANK Paek") === "kbank-paek" && walletCodeForTab("1.2 x", "KBANK Paek") === null
  && walletCodeForTab("1.2 x", "Binance DAD") === "binance-dad" && walletCodeForTab("1.13 x", "KBANK Paek") === null, "a bank tab feeds its wallet only from 1.3");
check(isFrozenWallet("binance-dad") && isFrozenWallet("kkp-paek") && !isFrozenWallet("kbank-paek") && !isFrozenWallet("bybit"), "frozen wallets are named");
const BANK_HEAD = ["", "วันที่ทำรายการ", "เวลา", "ยอดเงินเข้า", "ยอดเงินออก", "ยอดเงินคงเหลือ", "ประเภทสินค้า ใช้จ่ายบริษัท", "รายการแยกย่อย", "ประเภทสินค้า สั่งซื้อ", "รายการแยกย่อย", "จำนวน(ค่าเงิน TH) / จำนวนสินค้", "ราคารวม", "ผู้ขาย"];
const sep = parseWalletTab("kbank-paek", [BANK_HEAD,
  ["0", "46265", "", "", "", "1000", "", "ยกยอดมา"],
  ["0", "46280", "13.37", "", "200", "800", "", "", "ค่าใช้จ่าย สั่งซื้อ", "True Wallet DAD", "200", "200", "Shopee pay"],
  ["0", "46296", "11.2", "", "300", "500", "ค่าใช้จ่ายบริษัท", "ค่าน้ำ", "", "", "300", "300"],
], "2026-09");
const pay = sep.records.find((record) => !record.opening);
check(sep.records[0].opening && fromWalletUnits(sep.records[0].balances.THB) === "1000" && pay.desc === "ค่าใช้จ่าย สั่งซื้อ · True Wallet DAD" && pay.minutes === 817
  && pay.details.map((item) => item.label).join() === "ผู้ขาย", "a bank tab reads its date header, joins the description columns and leaves the amount copies out");
const oct = parseWalletTab("kbank-paek", [BANK_HEAD, ["0", "46296", "", "", "", "500", "", "ยกยอดมา"], ["0", "46297", "9.1", "100", "", "600", "เงินสดเข้าบัญชี", "GSB"]], "2026-10");
const bank = planWalletEntries([{ code: "kbank-paek", period: "2026-09", tab: "KBANK Paek", records: sep.records }, { code: "kbank-paek", period: "2026-10", tab: "KBANK Paek", records: oct.records }]);
check(bank.mismatches.length === 0 && bank.totals["kbank-paek:THB"] === "600", "a bank row past the next file's start stays when the next file does not repeat it");
const dad = parseWalletTab("binance-dad", [["Date", "time", "MMK In", "USDT ที่ได้", "USDT ที่ใช้", "USDT FEE", "USDT ที่ใข้ (รวม)", "USDT คงเหลือ"],
  ["", "", "ย้ายยอด", "", "", "", "0", "10"], ["45749", "12:34", "Reseller", "4", "", "", "0", "14"]], "2026-10");
check(dad.problems.length === 0 && !dad.records[1].slipped && dad.records[0].date === "2025-04-02", "a frozen tab keeps its old rows and puts the carried balance before them");
console.log(`account sheets: ${passed} passed`);
