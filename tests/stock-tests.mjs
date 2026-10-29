import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeStockCode,
  normalizeStockMoney,
  stockTone,
  summarizeStockLines,
  validateStockMove,
} from "../src/lib/stock.js";
import { hasPermission, normalizePermissions, PERMISSIONS, togglePermission } from "../src/lib/permissions.js";
import { parseStockSheetBalances, stockSheetOpeningMoves } from "../src/lib/stock-sheet.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

check(normalizeStockCode(" PES1 ") === "pes1" && normalizeStockCode("wuthering01") === "wuthering01", "codes are lower-cased and trimmed");
check(normalizeStockCode("p") === "" && normalizeStockCode("pes 1") === "" && normalizeStockCode("-pes") === "", "too short, spaced or leading-dash codes are refused");
check(normalizeStockMoney("1,054.456") === "1054.46" && normalizeStockMoney("") === "" && normalizeStockMoney("-3") === "", "money keeps two decimals and refuses negatives");

const lines = [{ kind: "in", qty: 50 }, { kind: "out", qty: -7 }, { kind: "adjust", qty: -1 }, { kind: "in", qty: 10 }];
const summary = summarizeStockLines(lines);
check(summary.received === 60 && summary.used === 7 && summary.adjusted === -1 && summary.left === 52, "a balance is the sum of its moves");
check(stockTone(0) === "empty" && stockTone(-2) === "empty" && stockTone(4, 5) === "low" && stockTone(5, 5) === "ok", "tones follow the pack's own threshold");

const balances = { 1: 41, 2: 1 };
const out = validateStockMove({ kind: "out", queue: " 215560 ", lines: [{ itemId: 1, qty: 1 }, { itemId: 2, qty: 1 }] }, balances);
check(!out.error && out.queue === "215560" && out.lines.every((line) => line.qty === -1), "a cut is stored as negative quantities");
check(validateStockMove({ kind: "out", queue: "1", lines: [{ itemId: 2, qty: 2, label: "260 Coins" }] }, balances).error === "260 Coins เหลือ 1 ตัดได้ไม่เกินนั้น", "a cut cannot take more than is left");
check(Boolean(validateStockMove({ kind: "out", lines: [{ itemId: 1, qty: 1 }] }, balances).error), "a cut needs the queue number it was for");
check(Boolean(validateStockMove({ kind: "adjust", lines: [{ itemId: 1, qty: -1 }] }, balances).error), "a correction needs a reason");
check(!validateStockMove({ kind: "adjust", note: "นับใหม่", lines: [{ itemId: 1, qty: -1 }] }, balances).error, "a correction may lower a balance");
check(Boolean(validateStockMove({ kind: "adjust", note: "x", lines: [{ itemId: 2, qty: -2 }] }, balances).error), "a correction cannot take a balance below zero");
check(Boolean(validateStockMove({ kind: "in", lines: [{ itemId: 1, qty: 1 }, { itemId: 1, qty: 2 }] }, balances).error), "one pack appears once per move");
check(Boolean(validateStockMove({ kind: "in", lines: [{ itemId: 1, qty: 1.5 }] }, balances).error), "quantities are whole numbers");
check(validateStockMove({ kind: "in", lines: [{ itemId: 1, qty: 10, unitCost: "115" }] }, balances).lines[0].unitCost === "115", "a receipt keeps its unit cost");
check(Boolean(validateStockMove({ kind: "in", lines: [] }, balances).error), "a move has at least one pack");

check(PERMISSIONS.some((item) => item.key === "stock.access") && PERMISSIONS.some((item) => item.key === "stock.admin"), "Stock has view and edit permissions");
check(normalizePermissions(["stock.admin"]).includes("stock.access"), "editing stock implies seeing it");
check(!togglePermission(["stock.access", "stock.admin"], "stock.access", false).includes("stock.admin"), "removing view also removes edit");
check(!hasPermission({ role: "admin", permissions: [] }, "stock.access"), "Stock is granted per account, not by role");

const repository = read("../src/server/stock-repository.js");
check(repository.includes("FOR UPDATE") && repository.includes("validateStockMove"), "a move is checked against balances read under a lock");
check(repository.includes("error.duplicateQueue = true"), "a queue number used before is flagged");
const hub = read("../src/app/page.js");
check(hub.includes('if (system.key === "stock") return hasPermission(me, "stock.access");'), "the hub shows Stock only to accounts that may see it");

// The "ตรวจสอบยอดคงเหลือ" tab: blocks side by side, a total block, a one-cell total row.
const head = ["ไอดี", "PACK", "USD", "สถานะ", "ผู้ใช้งาน", "ปัจจุบัน", "ใช้ไป", "คงเหลือ"];
const sheet = [
  ["ยอดคงเหลือ pes1", "", "", "", "", "", "", "", "", "ยอดคงเหลือ Last War"],
  [...head, "", ...head],
  ["pes1", "130", "1.2", "ปกติ", "ผู้ลงรายการ", "50", "7", "43", "", "lastwar1", "1 USD", "1", "ปกติ", "ผู้ลงรายการ", "1,141", "0", "1,141"],
  ["pes1", "550", "4.8", "ปกติ", "ผู้ลงรายการ", "166", "125", "41", "", "lastwar1", "2 USD", "2", "ปกติ", "ผู้ลงรายการ", "#REF!", "0", "#REF!"],
  ["pes1", "750", "6.5", "ปกติ", "ผู้ลงรายการ", "72", "23", "50", "", "", "", "", "", "คงเหลือ", "#REF!"],
  ["", "", "", "", "", "", "", "", "", "wuthering01", "60", "1", "ปกติ", "ผู้ลงรายการ", "0", "11", "-11"],
  ["ยอดคงเหลือรวม pes"],
  [...head],
  ["pes", "130", "1.2", "ปกติ", "", "50", "7", "43"],
];
const parsed = parseStockSheetBalances(sheet).accounts;
const byCode = Object.fromEntries(parsed.map((account) => [account.code, account]));
check(parsed.map((account) => account.code).join() === "pes1,lastwar1,wuthering01", "every block is read, the total block is not");
check(byCode.lastwar1.packs[0].received === 1141, "thousands separators read as numbers");
check(byCode.lastwar1.packs[1].problem === "unreadable" && byCode.wuthering01.packs[0].problem === "negative", "#REF! and below-zero packs are flagged");
check(byCode.pes1.packs.length === 3 && !byCode.lastwar1.packs.some((pack) => pack.label === "คงเหลือ"), "the one-cell total row is not a pack");
const opening = stockSheetOpeningMoves(byCode.pes1.packs[2]);
check(opening.in === 72 && opening.out === 23 && opening.adjust === 1, "a balance the sheet does not add up to gets a correction");
check(stockSheetOpeningMoves(byCode.wuthering01.packs[0]).in === 0, "a flagged pack comes in at zero");

console.log(`stock: ${passed} passed`);
