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
  sheetPeriod,
  walletCodeForTab,
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
check(excelDate("46296") === "2026-10-01" && excelDate("123") === null && excelDate("abc") === null, "day serials become dates, other numbers do not");
check(sheetMinutes("9.4") === 580 && sheetMinutes("10.19") === 619 && sheetMinutes("0.5") === 720 && sheetMinutes("21:51:") === 1311 && sheetMinutes("") === null, "the time column reads hour.minute, day fractions and text");

const scrubbed = scrubSheetRows([
  ["Date", "inblackgaming@gmail.com", "Secret5713@", "x@y.com", "1234.5"],
  ["Code", "PIN"],
  ["ABC", "0042"],
  ["", "", "a@b.co", "has space"],
]);
check(scrubbed.rows[0][2] === REMOVED_CELL && scrubbed.rows[0][4] === "1234.5", "a login right after an e-mail is dropped; a number after one is kept");
check(scrubbed.rows[2][1] === REMOVED_CELL && scrubbed.rows[2][0] === "ABC" && scrubbed.rows[3][3] === "has space", "a PIN column is dropped below its header; text with spaces stays");
check(scrubbed.removed === 2, "dropped cells are counted");

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

console.log(`account sheets: ${passed} passed`);
