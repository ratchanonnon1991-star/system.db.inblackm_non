import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStockOverview, daysSince } from "../src/lib/stock-overview.js";
import { normalizeStockCode } from "../src/lib/stock.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const now = Date.parse("2026-11-04T12:00:00Z");
const ago = (days) => new Date(now - days * 86400000).toISOString();
check(daysSince(ago(3), now) === 3 && daysSince(ago(0.2), now) === 0 && daysSince(null, now) === null, "waiting is counted in whole days");

const line = (itemId, qtyOrdered, qtyReceived = 0) => ({ itemId, label: `p${itemId}`, qtyOrdered, qtyReceived });
const orders = [
  { id: 1, code: "PO-00001", status: "paid", currency: "USDT", amount: "100", amountThb: 3300, paidAt: ago(1), lines: [line(10, 5)] },
  { id: 2, code: "PO-00002", status: "paid", currency: "USDT", amount: "50", amountThb: 1650, paidAt: ago(4), lines: [line(11, 2)] },
  { id: 3, code: "PO-00003", status: "partial", currency: "USDT", amount: "96", amountThb: null, paidAt: ago(2), lines: [line(12, 20, 12)] },
  { id: 4, code: "PO-00004", status: "refund_requested", currency: "USDT", amount: "44", refundAmount: "44", lines: [line(13, 5)] },
  { id: 5, code: "PO-00005", status: "requested", currency: "THB", amount: "4800", createdAt: ago(0), lines: [line(14, 120)] },
  { id: 6, code: "PO-00006", status: "requested", currency: "USDT", amount: "300", createdAt: ago(2), lines: [line(10, 1)] },
  { id: 7, code: "PO-00007", status: "received", currency: "USDT", amount: "10", lines: [line(15, 1, 1)] },
];
const accounts = [
  { code: "fc01", status: "active", gameName: "FC", items: [
    { id: 10, label: "2200", left: 0, lowAt: 5, tone: "empty" },
    { id: 11, label: "1070", left: 3, lowAt: 5, tone: "low" },
    { id: 15, label: "520", left: 10, lowAt: 5, tone: "ok" },
  ] },
  { code: "pes1", status: "active", items: [{ id: 13, label: "1040", left: 0, lowAt: 5, tone: "empty" }] },
  { code: "old", status: "closed", items: [{ id: 99, label: "x", left: 0, lowAt: 5, tone: "empty" }] },
];
const wallets = [
  { name: "BITKUB", balances: [{ currency: "THB", balance: "56650" }, { currency: "USDT", balance: "250" }] },
  { name: "Bybit", balances: [{ currency: "USDT", balance: "269.3" }] },
];
const view = buildStockOverview({ orders, wallets, accounts }, now);

check(view.followUps.paid.count === 2 && view.followUps.paid.orders[0].code === "PO-00002" && view.followUps.paid.oldestDays === 4, "paid orders waiting for goods come oldest first");
check(view.followUps.paid.thb === 4950, "the THB still out for goods is summed");
check(view.followUps.partial.stillToCome === 8, "a part-received order counts what is still to come");
check(view.followUps.refund_requested.byCurrency[0].amount === "44", "refunds asked are summed per currency");
check(view.followUps.requested.count === 2 && view.openCount === 6, "orders not finished are counted per step");
const later = buildStockOverview({ orders: [...orders, { id: 8, code: "PO-00008", status: "delivered", currency: "USDT", amount: "5", paidAt: ago(1), lines: [line(11, 1)] }, { id: 9, code: "PO-00009", status: "approved", currency: "USDT", amount: "5", createdAt: ago(1), lines: [line(10, 1)] }], wallets, accounts }, now);
check(later.followUps.delivered.count === 1 && later.followUps.approved.count === 1 && later.openCount === 8, "deliveries to check and approved orders are counted too");
check(later.lowPacks.find((pack) => pack.itemId === 10).incoming.some((item) => item.code === "PO-00009"), "an approved order counts as on the way");

const empty2200 = view.lowPacks.find((pack) => pack.itemId === 10);
check(view.lowPacks[0].tone === "empty" && !view.lowPacks.some((pack) => pack.itemId === 15 || pack.itemId === 99), "empty packs first; packs in good shape and closed accounts are left out");
check(empty2200.incoming.map((item) => item.code).join() === "PO-00001,PO-00006", "an empty pack shows the open orders that will refill it");
check(view.lowPacks.find((pack) => pack.itemId === 13).refunding && !view.lowPacks.find((pack) => pack.itemId === 13).incoming.length, "a pack whose order is being refunded shows that nothing is coming");

check(view.shortfalls.length === 1 && view.shortfalls[0].currency === "USDT" && view.shortfalls[0].need === "300" && view.shortfalls[0].have === "269.3", "orders to pay that no wallet can cover are flagged");
check(!view.shortfalls.some((item) => item.currency === "THB"), "a currency a wallet can cover is not flagged");

check(normalizeStockCode("inventory") === "", "no account code can hide the inventory page");
const layout = read("../src/app/stock/layout.js");
check(layout.includes("StockNav"), "every Stock page shares the tab bar");
const front = read("../src/app/stock/page.js");
check(front.includes("buildStockOverview"), "the Stock front page is the to-do overview");
check(read("../src/app/stock/inventory/page.js").includes("StockOverview"), "the account cards moved to the inventory tab");

console.log(`stock-overview: ${passed} passed`);
