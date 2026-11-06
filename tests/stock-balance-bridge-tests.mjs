// The Stock balances the TopUp admin reads: what crosses the bridge, and who may ask. No DB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stockBalanceReport } from "../src/lib/stock-balance-report.js";
import { bridgeSignature, verifyBridgeRequest } from "../src/server/itune-order-bridge-auth.js";

let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; };

const accounts = [
  { code: "hsr", gameId: 7, gameName: "sheet name", dataMode: "uid", status: "check", note: "secret note", valueUsd: 99, webSoldOut: true,
    items: [{ label: "4.8 USD", packName: "550 Coin / 840 Coin", left: 12, lowAt: 10, tone: "ok", avgCost: 3.2, unitUsd: 4.8, received: 20 }] },
  { code: "pes1", gameId: null, gameName: "eFootball", dataMode: "idpass", status: "active", items: [{ label: "1.2 USD", packName: "", left: 0, lowAt: 10, tone: "empty" }] },
  { code: "old", gameId: null, gameName: "Gone", dataMode: "uid", status: "closed", items: [] },
];
const report = stockBalanceReport(accounts, [{ id: 7, name: "Honkai: Star Rail" }]);

check(report.accounts.length === 2 && !report.accounts.some((account) => account.code === "old"), "a closed account is not sent");
check(report.accounts[0].game === "Honkai: Star Rail" && report.accounts[1].game === "eFootball", "the linked game's name comes first, else the sheet's");
check(report.accounts[0].webSoldOut === true && report.accounts[1].webSoldOut === false, "the main-site switch goes along, off unless turned on");
check(report.accounts[1].dataMode === "idpass", "the mode goes along, so UID and ID-Pass packs stay apart");
assert.deepEqual(report.accounts[0].items[0], { label: "4.8 USD", packNames: ["550 Coin / 840 Coin", "550 Coin", "840 Coin"], left: 12, lowAt: 10, tone: "ok" });
passed += 1;
check(report.accounts[1].items[0].packNames.length === 0, "a pack with no GameInfo name sends none");
check(!/secret note|avgCost|unitUsd|valueUsd|received/.test(JSON.stringify(report)), "costs, value and notes never cross the bridge");

const secret = "x".repeat(32);
const now = 1_800_000_000_000;
const headers = (body) => new Headers({ "x-itune-timestamp": String(now), "x-itune-signature": bridgeSignature(secret, String(now), body) });
verifyBridgeRequest(headers("stock-balance\n{}"), "stock-balance\n{}", secret, now);
passed += 1;
assert.throws(() => verifyBridgeRequest(headers("workforce\n{}"), "stock-balance\n{}", secret, now), { status: 401 });
passed += 1;
assert.throws(() => verifyBridgeRequest(new Headers(), "stock-balance\n{}", secret, now), { status: 401 });
passed += 1;

const route = readFileSync(new URL("../src/app/api/integrations/inblackm/stock/route.js", import.meta.url), "utf8");
check(route.includes("verifyBridgeRequest(request.headers, `stock-balance\\n${raw}`)"),"the route checks the signature, under its own prefix");
check(route.indexOf("verifyBridgeRequest(") < route.indexOf("listStockAccounts()"), "the signature is checked before anything is read");
check(!/\bexport async function (GET|PUT|PATCH|DELETE)\b/.test(route) && !/recordStockMove|updateStock/.test(route), "the bridge only reads");

console.log(`stock balance bridge: ${passed} passed`);
