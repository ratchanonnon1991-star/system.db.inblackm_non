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

console.log(`stock: ${passed} passed`);
