import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_WALLETS,
  fromWalletUnits,
  normalizeWalletAmount,
  reviewWalletAdjust,
  sumWalletLegs,
  toWalletUnits,
  validateWalletEntry,
  walletKey,
} from "../src/lib/stock-wallets.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

check(toWalletUnits("1,054.12345678") === 105412345678n && fromWalletUnits(105412345678n) === "1054.12345678", "amounts keep 8 decimals exactly");
check(toWalletUnits("0.000000015") === 2n && toWalletUnits("abc") === null && toWalletUnits("") === null, "a 9th decimal rounds half-up; text is not an amount");
check(fromWalletUnits(-150000000n) === "-1.5" && fromWalletUnits(0n) === "0", "trailing zeros drop, signs stay");
check(normalizeWalletAmount("0.1") === "0.1" && normalizeWalletAmount("") === "" && normalizeWalletAmount("-1") === null && normalizeWalletAmount("0") === null, "an amount is a positive number");
check(normalizeWalletAmount("0", { allowZero: true }) === "0", "a fee may be zero");
check(DEFAULT_WALLETS.map((wallet) => wallet.code).join() === "bitazza,bitkub,bybit", "the three wallets come set up");
check(DEFAULT_WALLETS.find((wallet) => wallet.code === "bybit").currencies.join() === "USDT,USDC,BTC", "Bybit holds USDT, USDC and BTC");

const wallets = [
  { id: 1, code: "bitazza", name: "Bitazza", currencies: ["USDT"] },
  { id: 2, code: "bitkub", name: "BITKUB", currencies: ["THB", "USDT"] },
  { id: 3, code: "bybit", name: "Bybit Inblack Gaming", currencies: ["USDT", "USDC", "BTC"] },
];
const balances = { [walletKey(1, "USDT")]: toWalletUnits("1000"), [walletKey(2, "USDT")]: toWalletUnits("500"), [walletKey(3, "USDT")]: toWalletUnits("20") };

const deposit = validateWalletEntry({ kind: "deposit", toWalletId: 1, toCurrency: "usdt", amount: "1000", fee: "1", title: "Russia deposit" }, wallets, balances);
check(!deposit.error && deposit.legs.length === 1 && deposit.legs[0].amount === toWalletUnits("999") && deposit.legs[0].fee === toWalletUnits("1"), "a deposit lands net of its fee");
check(Boolean(validateWalletEntry({ kind: "deposit", toWalletId: 1, toCurrency: "THB", amount: "10" }, wallets, balances).error), "a wallet only takes its own currencies");

const move = validateWalletEntry({ kind: "transfer", fromWalletId: 1, fromCurrency: "USDT", toWalletId: 2, toCurrency: "USDT", amount: "900", fee: "1" }, wallets, balances);
check(!move.error && move.legs[0].amount === toWalletUnits("-901") && move.legs[1].amount === toWalletUnits("900"), "a move takes amount + fee from one side and lands the amount on the other");
check(Boolean(validateWalletEntry({ kind: "transfer", fromWalletId: 1, fromCurrency: "USDT", toWalletId: 2, toCurrency: "USDT", amount: "1000", fee: "1" }, wallets, balances).error), "a move cannot take more than is there, fee included");
check(Boolean(validateWalletEntry({ kind: "transfer", fromWalletId: 2, fromCurrency: "USDT", toWalletId: 2, toCurrency: "USDT", amount: "1" }, wallets, balances).error), "a move is between two wallets");
check(Boolean(validateWalletEntry({ kind: "transfer", fromWalletId: 2, fromCurrency: "USDT", toWalletId: 3, toCurrency: "USDC", amount: "1" }, wallets, balances).error), "a move keeps its currency");

const swap = validateWalletEntry({ kind: "exchange", fromWalletId: 2, fromCurrency: "USDT", toWalletId: 2, toCurrency: "THB", amount: "100", amountTo: "3325.5" }, wallets, balances);
check(!swap.error && swap.legs[0].amount === toWalletUnits("-100") && swap.legs[1].amount === toWalletUnits("3325.5"), "an exchange swaps one currency for another in one wallet");
check(Boolean(validateWalletEntry({ kind: "exchange", fromWalletId: 2, fromCurrency: "USDT", toWalletId: 3, toCurrency: "USDC", amount: "1", amountTo: "1" }, wallets, balances).error), "an exchange stays in one wallet");

const short = validateWalletEntry({ kind: "payment", fromWalletId: 3, fromCurrency: "USDT", amount: "30", title: "Razer 100 USD" }, wallets, balances);
check(/ไม่พอ/.test(short.error) && /BITKUB/.test(short.error), "a Bybit payment it cannot cover says to top up from BITKUB");
const pay = validateWalletEntry({ kind: "payment", fromWalletId: 3, fromCurrency: "USDT", amount: "19.5", fee: "0.5", title: "Razer 20 USD" }, wallets, balances);
check(!pay.error && pay.legs[0].amount === toWalletUnits("-20") && pay.entry.status === "pending", "a payment takes amount + fee and starts as waiting for goods");
check(Boolean(validateWalletEntry({ kind: "payment", fromWalletId: 3, fromCurrency: "USDT", amount: "1" }, wallets, balances).error), "a payment names what it bought");

check(Boolean(validateWalletEntry({ kind: "adjust", toWalletId: 3, toCurrency: "BTC", amount: "-0.001" }, wallets, balances).error), "a correction needs a reason");
check(Boolean(validateWalletEntry({ kind: "adjust", toWalletId: 3, toCurrency: "BTC", amount: "-0.001", note: "นับใหม่" }, wallets, balances).error), "a correction cannot take a balance below zero");
check(!validateWalletEntry({ kind: "adjust", toWalletId: 3, toCurrency: "BTC", amount: "0.00012345", note: "ยอดจริงในแอป" }, wallets, balances).error, "a correction may raise a balance to the app's figure");
check(Boolean(validateWalletEntry({ kind: "payment", fromWalletId: 3, fromCurrency: "USDT", amount: "1", title: "x", occurredAt: "not a date" }, wallets, balances).error), "a receipt time must be a date");
check(validateWalletEntry({ kind: "adjust", toWalletId: 3, toCurrency: "BTC", amount: "0.001", note: "ยอดจริง" }, wallets, balances).entry.status === "awaiting_approval", "a correction waits for approval");
check(validateWalletEntry({ kind: "transfer", fromWalletId: 1, fromCurrency: "USDT", toWalletId: 2, toCurrency: "USDT", amount: "1" }, wallets, balances).entry.status === "done", "a move counts at once");
const adjust = { kind: "adjust", status: "awaiting_approval", actorId: 5 };
check(reviewWalletAdjust(adjust, "approve", { id: 5 }).error === "คนอนุมัติต้องเป็นคนละคนกับคนปรับยอด", "whoever typed a correction cannot approve it");
check(reviewWalletAdjust(adjust, "approve", { id: 9 }).status === "done", "someone else approves it");
check(Boolean(reviewWalletAdjust(adjust, "reject", { id: 9 }).error) && reviewWalletAdjust(adjust, "reject", { id: 9 }, "ยอดไม่ตรงแอป").status === "rejected", "a rejection says why");
check(Boolean(reviewWalletAdjust({ ...adjust, status: "done" }, "approve", { id: 9 }).error) && Boolean(reviewWalletAdjust({ ...adjust, kind: "payment" }, "approve", { id: 9 }).error), "only corrections awaiting approval are reviewed");

const totals = sumWalletLegs([{ walletId: 1, currency: "USDT", amount: "999" }, { walletId: 1, currency: "USDT", amount: "-901" }, { walletId: 2, currency: "USDT", amount: "900" }]);
check(totals[walletKey(1, "USDT")] === toWalletUnits("98") && totals[walletKey(2, "USDT")] === toWalletUnits("900"), "a balance is the sum of its legs");

const repository = read("../src/server/stock-wallet-repository.js");
check(repository.includes("FOR UPDATE") && repository.includes("validateWalletEntry"), "an entry is checked against balances read under a lock");
check(repository.includes("NUMERIC(30, 8)"), "wallet amounts are stored with 8 decimals");
check(repository.includes("WALLET_COUNTED") && repository.includes("reviewWalletAdjust"), "corrections stay out of balances until someone else approves them");
const orders = read("../src/server/stock-purchase-order-repository.js");
check(orders.includes("insertWalletEntry(client"), "paying an order writes its wallet payment in the same transaction");

console.log(`stock-wallets: ${passed} passed`);
