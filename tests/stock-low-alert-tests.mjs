// The low-stock alert: which packs are due, what it says, and that a failed send is tried again.
import assert from "node:assert/strict";
import { stockLowAlertPlan, stockLowAlertText } from "../src/lib/stock-low-alert.js";

let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; };

const item = (id, left, patch = {}) => ({ id, label: `${id} USD`, packName: "", left, lowAt: 10, received: 50, lowAlertAt: null, ...patch });
const account = (items, patch = {}) => ({ code: "hsr", status: "check", items, ...patch });
const dueIds = (accounts) => stockLowAlertPlan(accounts).due.map((pack) => pack.id);

check(JSON.stringify(dueIds([account([item(1, 9), item(2, 10), item(3, 0)])])) === "[1,3]", "below the level is due, at the level is not");
check(dueIds([account([item(1, 3, { lowAlertAt: "2026-11-06" })])]).length === 0, "a pack already alerted is not alerted again");
check(dueIds([account([item(1, 0, { received: 0 })])]).length === 0, "a pack never stocked is not reported as running out");
check(dueIds([account([item(1, 0, { lowAt: 0 })])]).length === 0, "a level of 0 means no alert");
check(dueIds([account([item(1, 0)], { status: "closed" })]).length === 0, "a closed account is left out");
check(JSON.stringify(stockLowAlertPlan([account([item(1, 20, { lowAlertAt: "2026-11-06" }), item(2, 3, { lowAlertAt: "2026-11-06" })])]).cleared) === "[1]", "a pack back above its level can alert again later");

const text = stockLowAlertText([{ id: 1, code: "hsr", label: "10 USD", packName: "60 Orb", left: 3, lowAt: 10 }, { id: 2, code: "zzz", label: "20 USD", packName: "", left: 0, lowAt: 5 }]);
check(text.includes("เหลือ 3 / เกณฑ์ 10 · hsr · 10 USD (60 Orb)") && text.includes("หมด / เกณฑ์ 5 · zzz · 20 USD"), "the message names the pack, what is left and the level");
const many = stockLowAlertText(Array.from({ length: 45 }, (_, id) => ({ id, code: "x", label: "1 USD", packName: "", left: 1, lowAt: 5 })));
check(many.includes("และอีก 5 แพ็ค") && many.length < 4096, "a long list stays within one Telegram message");

const { runStockLowAlert } = await import("../src/server/stock-low-alert.js");
const accounts = async () => [account([item(1, 3), item(2, 20, { lowAlertAt: "2026-11-06" })])];
const marks = [];
const sends = [];
const sent = await runStockLowAlert({ list: accounts, send: async (message) => { sends.push(message); }, mark: async (...args) => { marks.push(args); } });
check(sent.sent === 1 && sends.length === 1 && JSON.stringify(marks[0]) === "[[1],[2]]", "a sent alert is remembered and a recovered pack forgotten");
const quietMarks = [];
const failed = await runStockLowAlert({ list: accounts, send: async () => { throw new Error("TELEGRAM_SEND_FAILED"); }, mark: async (...args) => { quietMarks.push(args); } });
check(failed.failed === true && quietMarks.length === 0, "a failed send marks nothing, so it is tried again");
const idle = await runStockLowAlert({ list: async () => [account([item(1, 20)])], send: async () => { throw new Error("must not send"); }, mark: async () => { throw new Error("must not mark"); } });
check(idle.sent === 0 && idle.failed === false, "nothing due sends nothing");

console.log(`stock low alert: ${passed} passed`);
