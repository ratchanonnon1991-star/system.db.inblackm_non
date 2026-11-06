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
  walletCheckSignature,
  walletCheckState,
  walletKey,
  walletStatusChange,
  walletStatusDecision,
  planSheetWalletSync,
  sheetEntryFingerprint,
  WALLET_COUNTED,
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
check(DEFAULT_WALLETS.filter((wallet) => wallet.group === "main").map((wallet) => wallet.code).join() === "bitazza,bitkub,bybit", "the three Stock wallets come set up as the main group");
check(new Set(DEFAULT_WALLETS.map((wallet) => wallet.code)).size === DEFAULT_WALLETS.length && DEFAULT_WALLETS.every((wallet) => wallet.code.length <= 32 && wallet.currencies.every((c) => /^[A-Z]{3,5}$/.test(c))), "wallet codes are unique and currencies valid");
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
check(validateWalletEntry({ kind: "adjust", toWalletId: 3, toCurrency: "BTC", amount: "0.001", note: "ยอดจริง" }, wallets, balances).entry.status === "done", "a correction counts at once");
check(validateWalletEntry({ kind: "transfer", fromWalletId: 1, fromCurrency: "USDT", toWalletId: 2, toCurrency: "USDT", amount: "1" }, wallets, balances).entry.status === "done", "a move counts at once");
const adjust = { kind: "adjust", status: "awaiting_approval", actorId: 5 };
check(reviewWalletAdjust(adjust, "approve", { id: 5 }).status === "done", "a correction left awaiting approval can be approved, even by whoever typed it");
check(Boolean(reviewWalletAdjust(adjust, "reject", { id: 9 }).error) && reviewWalletAdjust(adjust, "reject", { id: 9 }, "ยอดไม่ตรงแอป").status === "rejected", "a rejection says why");
check(Boolean(reviewWalletAdjust({ ...adjust, status: "done" }, "approve", { id: 9 }).error) && Boolean(reviewWalletAdjust({ ...adjust, kind: "payment" }, "approve", { id: 9 }).error), "only corrections awaiting approval are reviewed");

const totals = sumWalletLegs([{ walletId: 1, currency: "USDT", amount: "999" }, { walletId: 1, currency: "USDT", amount: "-901" }, { walletId: 2, currency: "USDT", amount: "900" }]);
check(totals[walletKey(1, "USDT")] === toWalletUnits("98") && totals[walletKey(2, "USDT")] === toWalletUnits("900"), "a balance is the sum of its legs");

const repository = read("../src/server/stock-wallet-repository.js");
check(repository.includes("FOR UPDATE") && repository.includes("validateWalletEntry"), "an entry is checked against balances read under a lock");
check(repository.includes("NUMERIC(30, 8)"), "wallet amounts are stored with 8 decimals");
check(repository.includes("WALLET_COUNTED") && repository.includes("reviewWalletAdjust"), "corrections left awaiting approval stay out of balances");
const orders = read("../src/server/stock-purchase-order-repository.js");
check(orders.includes("insertWalletEntry(client"), "paying an order writes its wallet payment in the same transaction");

const sheet = validateWalletEntry({ kind: "payment", fromWalletId: 3, fromCurrency: "USDT", amount: "5", title: "Razer", channel: " Application ", destinationAccount: "ร้าน A", seller: "s1", buyer: "b1", credit: "1,250.5" }, wallets, balances);
check(!sheet.error && sheet.entry.channel === "Application" && sheet.entry.destinationAccount === "ร้าน A" && sheet.entry.seller === "s1" && sheet.entry.buyer === "b1" && sheet.entry.credit === "1250.5", "an entry keeps the sheet's channel, destination account, seller, buyer and credit");
check(sheet.legs[0].amount === -toWalletUnits("5"), "the sheet's columns never change the amount");
check(validateWalletEntry({ kind: "deposit", toWalletId: 1, toCurrency: "USDT", amount: "1" }, wallets, balances).entry.credit === "", "the sheet's columns are optional");
check(Boolean(validateWalletEntry({ kind: "deposit", toWalletId: 1, toCurrency: "USDT", amount: "1", credit: "abc" }, wallets, balances).error), "a credit must be a number");
check(repository.includes("destination_account") && repository.includes("ADD COLUMN IF NOT EXISTS credit"), "the sheet's columns are stored on the entry");

// Changing a done payment back to waiting needs a second person.
const payment = { kind: "payment", status: "pending", orderId: null, statusRequest: null };
check(walletStatusChange(payment, "done", { id: 5 }).status === "done", "waiting → done happens at once");
const done = { ...payment, status: "done" };
check(Boolean(walletStatusChange(done, "pending", { id: 5 }).error), "done → waiting needs a reason");
check(Boolean(walletStatusChange(done, "pending", null, "ของยังไม่มา").error), "done → waiting needs someone signed in");
const asked = walletStatusChange(done, "pending", { id: 5, name: "A" }, " ของยังไม่มา ");
check(!asked.status && asked.request.to === "pending" && asked.request.byId === 5 && asked.request.reason === "ของยังไม่มา", "done → waiting is stored as a request, not applied");
check(Boolean(walletStatusChange({ ...done, orderId: 7 }, "pending", { id: 5 }, "x").error) && Boolean(walletStatusChange({ ...done, kind: "deposit" }, "pending", { id: 5 }, "x").error), "only payments outside an order change status here");
check(Boolean(walletStatusChange(payment, "pending", { id: 5 }).error) && Boolean(walletStatusChange(payment, "lost", { id: 5 }).error), "the new status must be a different, known one");
const requested = { ...done, statusRequest: { to: "pending", byId: 5 } };
check(Boolean(walletStatusChange(requested, "pending", { id: 9 }, "x").error), "one request at a time");
check(Boolean(walletStatusDecision(requested, "approve", { id: 5 }).error) && Boolean(walletStatusDecision(requested, "approve", { id: "5" }).error), "whoever asked cannot confirm it");
check(walletStatusDecision(requested, "approve", { id: 9 }).status === "pending", "someone else confirms it and the status changes");
check(walletStatusDecision(requested, "reject", { id: 9 }).status === null, "someone else refuses it and the status stays");
check(walletStatusDecision(requested, "cancel", { id: 5 }).status === null && Boolean(walletStatusDecision(requested, "cancel", { id: 9 }).error), "only whoever asked withdraws it");
check(Boolean(walletStatusDecision(done, "approve", { id: 9 }).error) && Boolean(walletStatusDecision(requested, "approve", null).error) && Boolean(walletStatusDecision(requested, "maybe", { id: 9 }).error), "no request, no sign-in or an unknown answer is refused");
check(repository.includes("walletStatusChange") && repository.includes("walletStatusDecision") && repository.includes("status_request_by_id"), "the repository runs both steps and keeps who asked");

// Checking a wallet-month against its sheet.
const month = { sheetOpen: "100", systemOpen: "100", sheetClose: "50", systemClose: "50.005", rows: 12, drifts: [] };
check(walletCheckState(month) === "ok", "carried and closing balances that match (closing within 0.01) are ok");
check(walletCheckState({ ...month, systemOpen: "100.004" }) === "ok", "a carried balance within 0.01 is float dust, not a difference");
check(walletCheckState({ ...month, systemClose: "50.02" }) === "diff" && walletCheckState({ ...month, systemOpen: "99" }) === "diff", "a different carried or closing balance needs a look");
check(walletCheckState({ ...month, drifts: [{ rowNo: 7 }] }) === "diff", "a row breaking the sheet's own balance needs a look");
check(walletCheckState({ ...month, sheetOpen: null, sheetClose: null }) === "ok", "a month the sheet has no figure for is not flagged");
check(walletCheckState({ ...month, drifts: [{}], checkedAt: "2026-11-04" }) === "checked" && walletCheckState({ ...month, checkedAt: "2026-11-04", checkedStale: true }) === "stale", "a signed-off month is checked until its numbers change");
check(walletCheckSignature(month) !== walletCheckSignature({ ...month, systemClose: "50.01" }) && walletCheckSignature(month) !== walletCheckSignature({ ...month, drifts: [{}] }), "the sign-off remembers the numbers it was for");
check(repository.includes("walletCheckSignature") && repository.includes("checked_sig"), "a sign-off stores those numbers and is compared after each import");

check(repository.includes("walletEntryTrail") && repository.includes("OVER w AS cin") && repository.includes("l.currency = $2 AND ${WALLET_COUNTED}"), "the money trail is first in, first out over counted entries only");
check(read("../src/app/api/stock/wallets/entries/[id]/trail/route.js").includes("requireStockAccess"), "the trail needs Stock access");
// Importing the sheets again keeps what people did on the entries.
{
  const legs = (amount) => [{ walletCode: "bybit", currency: "USDT", amount, fee: "0" }];
  const print = (title, amount, at = "2026-10-01T05:00:00.000Z") => sheetEntryFingerprint({ kind: "payment", occurredAt: at, title, legs: legs(amount) });
  check(print("IOS Stock YAYA", "-462") === sheetEntryFingerprint({ kind: "payment", occurredAt: new Date("2026-10-01T05:00:00Z"), title: " IOS Stock YAYA ", legs: legs("-462.00000000") }),
    "the same money reads the same from the sheet and from the database");
  const existing = [
    { id: 1, sourceRef: "s:10:bybit:3", fingerprint: print("A", "-10"), touched: true },
    { id: 2, sourceRef: "s:10:bybit:4", fingerprint: print("B", "-20"), touched: false },
    { id: 3, sourceRef: "s:10:bybit:5", fingerprint: print("C", "-30"), touched: true },
    { id: 4, sourceRef: "s:10:bybit:6", fingerprint: print("D", "-40"), touched: true },
    { id: 5, sourceRef: "s:10:bybit:7", fingerprint: print("E", "-50"), touched: false },
  ];
  const incoming = [
    { sourceRef: "s:10:bybit:3", fingerprint: print("A", "-10") },  // unchanged
    { sourceRef: "s:10:bybit:5", fingerprint: print("B", "-20") },  // B moved down two rows
    { sourceRef: "s:10:bybit:6", fingerprint: print("D", "-45") },  // D's amount fixed in the sheet
    { sourceRef: "s:10:bybit:9", fingerprint: print("F", "-60") },  // a new row
  ];
  const plan = planSheetWalletSync(existing, incoming);
  const update = (id) => plan.updates.find((item) => item.id === id);
  check(update(1) && !update(1).changed, "an unchanged row keeps its entry");
  check(update(2)?.entry.sourceRef === "s:10:bybit:5" && !update(2).changed, "a row that moved keeps its entry, found by its money");
  check(update(4)?.changed && update(4).entry.fingerprint === print("D", "-45"), "a row whose money changed keeps its entry and takes the new figures");
  check(plan.inserts.length === 1 && plan.inserts[0].sourceRef === "s:10:bybit:9", "a new row is added");
  check(plan.removed.join() === "3", "a row gone from the sheet that someone worked on is set aside, not deleted");
  check(plan.deletes.join() === "5", "a row gone from the sheet that nobody touched is deleted");
  check(planSheetWalletSync([], incoming).inserts.length === 4, "a first import adds everything");
}

const sheetRepo = read("../src/server/account-sheet-repository.js");
check(sheetRepo.includes("planSheetWalletSync") && !/DELETE FROM stock_wallet_entries WHERE source_ref/.test(sheetRepo), "the import no longer wipes the sheet entries");
check(sheetRepo.includes("status_changed_at IS NULL AND reviewed_at IS NULL THEN"), "a status a person set survives an import");
check(WALLET_COUNTED.includes("sheet_removed_at IS NULL"), "an entry set aside counts in no balance");

console.log(`stock-wallets: ${passed} passed`);
