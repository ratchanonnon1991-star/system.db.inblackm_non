import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyPurchaseOrderAction,
  bestWalletPaymentMatch,
  normalizeReceiptUrl,
  purchaseOrderActions,
  purchaseOrderCny,
  purchaseOrderRemaining,
  purchaseOrderThb,
  sheetUsdtForUsd,
  topupCheck,
  validatePurchaseOrder,
  walletPaymentCandidates,
} from "../src/lib/stock-purchase-orders.js";
import { normalizeStockCode } from "../src/lib/stock.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// A wallet payment made outside an order is offered to orders waiting for money; a person confirms.
{
  const payment = {
    kind: "payment", status: "done", orderId: null, title: "Ragnarok", occurredAt: "2026-11-04T13:05:00Z",
    legs: [{ walletName: "BITKUB", currency: "USDT", amount: "-402", fee: "1" }],
  };
  const order = (id, extra) => ({ id, code: `PO-${id}`, status: "approved", currency: "USDT", amount: "401", supplier: "Panghou", gameName: "Ragnarok M", accountCode: "rag01", createdAt: "2026-11-03T10:00:00Z", ...extra });
  const one = walletPaymentCandidates(payment, [order(1), order(2, { status: "paid" }), order(3, { currency: "THB" })]);
  check(one.length === 1 && one[0].orderId === 1, "only approved orders in the payment's currency are offered");
  check(one[0].amountMatch && one[0].dateMatch && one[0].sure, "amount without the fee matches, within days → sure");
  check(bestWalletPaymentMatch(one)?.orderId === 1, "one sure order is offered as a single click");
  check(walletPaymentCandidates(payment, [order(4, { amount: "402" })])[0].amountMatch, "amount with the fee matches too");
  const name = walletPaymentCandidates(payment, [order(5, { gameName: "Ragnarok", createdAt: "2026-10-01T00:00:00Z" })])[0];
  check(name.nameMatch && !name.dateMatch && name.sure, "game name in the title + amount → sure even when far apart");
  const two = walletPaymentCandidates(payment, [order(6), order(7)]);
  check(two.length === 2 && bestWalletPaymentMatch(two) === null, "two sure orders → no single-click offer, a person picks");
  check(!walletPaymentCandidates(payment, [order(8, { amount: "320" })]).length, "a different amount is never offered");
  const far = walletPaymentCandidates(payment, [order(10, { gameName: "", supplier: "YAYA", accountCode: "x", createdAt: "2026-09-01T00:00:00Z" })]);
  check(far.length === 1 && !far[0].sure && bestWalletPaymentMatch(far) === null, "same amount but nothing else fits → listed, not offered as one click");
  check(!walletPaymentCandidates({ ...payment, orderId: 9 }, [order(1)]).length, "a payment already tied is not offered again");
  check(!walletPaymentCandidates({ ...payment, status: "awaiting_approval" }, [order(1)]).length, "a payment not counted yet is not offered");
  check(!walletPaymentCandidates({ ...payment, kind: "deposit" }, [order(1)]).length, "only payments can be tied");
}

// The 1.1 sheet's rates: Product Rate (CNY per USD), CNY Rate (CNY per USDT); neither sets the THB rate.
{
  const base = { supplier: "YAYA", amount: "462", lines: [{ itemId: 1, qty: 1 }] };
  const usdt = validatePurchaseOrder({ ...base, currency: "USDT", productRate: "7.2", cnyRate: "7.1" }, [1]);
  check(usdt.order.productRate === "7.2" && usdt.order.cnyRate === "7.1", "USDT order keeps both sheet rates");
  check(usdt.order.rateThb === "", "the sheet rates do not make up a THB rate");
  check(purchaseOrderCny({ amount: "100", currency: "USDT", cnyRate: "7.1" }) === 710, "USDT 100 × CNY Rate 7.1 = 710 CNY");
  check(purchaseOrderCny({ amount: "100", currency: "USD", productRate: "7.2" }) === 720, "USD 100 × Product Rate 7.2 = 720 CNY");
  check(purchaseOrderCny({ amount: "100", currency: "USDT", productRate: "7.2" }) === null, "a USDT order needs the CNY Rate for CNY");
  check(sheetUsdtForUsd(100, 7.2, 7.1) === 101.41, "Total USD 100 × 7.2 ÷ 7.1 = 101.41 USDT, as the sheet's TOTAL");
  check(sheetUsdtForUsd(100, 7.2, null) === null, "no CNY Rate, no USDT figure");
  const cny = validatePurchaseOrder({ ...base, currency: "CNY", productRate: "7.2", cnyRate: "4.6", rateThb: "4.6" }, [1]);
  check(cny.order.productRate === "" && cny.order.cnyRate === "" && cny.order.rateThb === "4.6", "CNY order: no sheet rates, its THB rate as typed");
  check(validatePurchaseOrder({ ...base, currency: "THB", cnyRate: "7.1" }, [1]).order.cnyRate === "", "THB order drops the sheet rates");
  check(validatePurchaseOrder({ ...base, currency: "USD", cnyRate: "abc" }, [1]).error, "CNY Rate must be a number");
  check(!validatePurchaseOrder({ ...base, currency: "USD", productRate: "7.2" }, [1]).error, "Product Rate alone is fine");
}

const good = {
  supplier: " Twocard ",
  paymentChannel: "Bybit Inblack Gaming",
  buyer: "RIN",
  currency: "usdt",
  amount: "1,054.456",
  rateThb: "33.25",
  receiptUrl: "https://example.com/r/1",
  lines: [{ itemId: 7, qty: 10, unitCost: "115" }, { itemId: 8, qty: 2 }],
};
const made = validatePurchaseOrder(good, [7, 8, 9]);
check(!made.error && made.order.supplier === "Twocard" && made.order.currency === "USDT" && made.order.amount === "1054.456", "an order is trimmed and upper-cased, its amount kept to 8 decimals");
check(made.lines.length === 2 && made.lines[0].unitCost === "115" && made.lines[1].unitCost === "", "lines keep their unit cost when given");
check(validatePurchaseOrder({ ...good, currency: "" }, [7, 8]).order.currency === "THB", "a blank currency means THB");
check(Boolean(validatePurchaseOrder({ ...good, supplier: " " }, [7, 8]).error), "an order names its supplier");
check(Boolean(validatePurchaseOrder({ ...good, amount: "0" }, [7, 8]).error), "an order has an amount to pay");
check(Boolean(validatePurchaseOrder({ ...good, rateThb: "-1" }, [7, 8]).error), "a rate is positive");
check(Boolean(validatePurchaseOrder({ ...good, lines: [{ itemId: 99, qty: 1 }] }, [7, 8]).error), "a line's pack belongs to the account");
check(Boolean(validatePurchaseOrder({ ...good, lines: [{ itemId: 7, qty: 1 }, { itemId: 7, qty: 2 }] }, [7, 8]).error), "one pack appears once per order");
check(Boolean(validatePurchaseOrder({ ...good, lines: [{ itemId: 7, qty: 1.5 }] }, [7, 8]).error), "ordered quantities are whole numbers");
check(Boolean(validatePurchaseOrder({ ...good, lines: [] }, [7, 8]).error), "an order has at least one pack");
check(Boolean(validatePurchaseOrder({ ...good, receiptUrl: "javascript:alert(1)" }, [7, 8]).error), "a receipt link must be http(s)");
check(normalizeReceiptUrl("") === "" && normalizeReceiptUrl("not a link") === null, "a blank receipt link is fine, text is not");

check(validatePurchaseOrder({ ...good, currency: "BTC", amount: "0.00123456" }, [7, 8]).order.amount === "0.00123456", "a BTC order keeps its satoshis");
check(purchaseOrderActions("requested").join() === "approve,cancel", "a request is approved or cancelled before any money goes out");
check(purchaseOrderActions("approved").join() === "pay,cancel", "an approved order can be paid or still cancelled");
check(purchaseOrderActions("paid").join() === "accept,deliver,request_refund", "a paid order can be accepted, delivered or refunded");
check(purchaseOrderActions("accepted").join() === "deliver,request_refund", "an accepted order waits for its delivery");
check(purchaseOrderActions("delivered").join() === "verify,reject_delivery", "a delivery is checked before it counts");
check(purchaseOrderActions("partial").join() === "deliver,request_refund", "a part-received order can take the rest or a refund");
check(purchaseOrderActions("refund_requested").join() === "refund", "a refund request waits for the money back");
check(["received", "refunded", "cancelled"].every((status) => !purchaseOrderActions(status).length), "finished orders take no more steps");

const order = {
  status: "paid",
  amount: "500",
  lines: [{ itemId: 7, qtyOrdered: 10, qtyReceived: 0, label: "550 Coins" }, { itemId: 8, qtyOrdered: 2, qtyReceived: 0, label: "1100 Coins" }],
};
check(Boolean(applyPurchaseOrderAction({ ...order, status: "requested" }, "pay").error), "an order is not paid before it is approved");
check(applyPurchaseOrderAction({ ...order, status: "approved" }, "pay", { walletId: 3 }).status === "paid", "paying from a wallet moves an approved order on");
check(Boolean(applyPurchaseOrderAction({ ...order, status: "approved" }, "pay").error), "paid needs a wallet or proof of an outside payment");
check(Boolean(applyPurchaseOrderAction({ ...order, status: "approved" }, "pay", { outside: true, note: "KBANK" }).error), "an outside payment needs a proof link or file");
check(Boolean(applyPurchaseOrderAction({ ...order, status: "approved", attachmentCount: 1 }, "pay", { outside: true, note: "KBANK", proofUrl: "drive/x" }).error), "a proof link that is not a link is refused even with a file attached");
{
  const filed = applyPurchaseOrderAction({ ...order, status: "approved", attachmentCount: 2 }, "pay", { outside: true, note: "KBANK P'aek" });
  check(filed.status === "paid" && filed.proofUrl === null && filed.note.includes("ไฟล์แนบในใบนี้ (2 ไฟล์)"), "a slip attached to the order is proof enough, and the note says so");
}
check(Boolean(applyPurchaseOrderAction({ ...order, status: "approved" }, "pay", { outside: true, proofUrl: "https://drive.google.com/x" }).error), "an outside payment says which channel");
{
  const outside = applyPurchaseOrderAction({ ...order, status: "approved" }, "pay", { outside: true, proofUrl: "https://drive.google.com/x", note: "KBANK P'aek" });
  check(outside.status === "paid" && outside.walletId === null && outside.note.includes("https://drive.google.com/x"), "an outside payment with proof and channel is paid, the proof in its note");
}
const maker = { id: 5 };
const other = { id: 9 };
check(applyPurchaseOrderAction({ ...order, status: "requested", createdById: 5 }, "approve", {}, maker).error === "คนอนุมัติต้องเป็นคนละคนกับคนสร้างใบสั่งซื้อ", "the maker cannot approve their own order");
check(applyPurchaseOrderAction({ ...order, status: "requested", createdById: 5 }, "approve", {}, other).status === "approved", "someone else approves it");
check(Boolean(applyPurchaseOrderAction({ ...order, status: "delivered", delivery: { lines: [{ itemId: 7, qty: 1 }], recordedById: 5 } }, "verify", {}, maker).error), "whoever recorded a delivery cannot check it");
check(applyPurchaseOrderAction({ ...order, status: "delivered", delivery: { lines: [{ itemId: 7, qty: 1 }], recordedById: 5 } }, "verify", {}, other).status === "partial", "someone else checks the delivery");
check(Boolean(applyPurchaseOrderAction({ ...order, status: "refund_requested", refundRequestedById: 5 }, "refund", {}, maker).error), "whoever asked for a refund cannot confirm it came back");
check(applyPurchaseOrderAction({ ...order, status: "refund_requested", refundRequestedById: 5 }, "refund", {}, other).status === "refunded", "someone else confirms the refund");
check(!applyPurchaseOrderAction({ ...order, status: "approved", createdById: 5 }, "pay", { walletId: 3 }, maker).error, "the maker may still record the payment once approved");
check(Boolean(applyPurchaseOrderAction(order, "pay").error), "an order is paid once");
check(Boolean(applyPurchaseOrderAction(order, "cancel").error), "a paid order is refunded, not cancelled");
check(Boolean(applyPurchaseOrderAction(order, "accept", {}).error), "an accepted order names the supplier's order number");
check(applyPurchaseOrderAction(order, "accept", { supplierRef: " 47418137 " }).supplierRef === "47418137", "the supplier's order number is kept");

const stockDelivery = (lines) => ({ delivery: { method: "stock", lines } });
const part = applyPurchaseOrderAction(order, "deliver", stockDelivery([{ itemId: 7, qty: 4 }, { itemId: 8, qty: 0 }]));
check(!part.error && part.status === "delivered" && part.delivery.lines.length === 1 && part.delivery.fromStatus === "paid", "a delivery waits for its check and remembers the step before");
check(applyPurchaseOrderAction(order, "deliver", stockDelivery([{ itemId: 7, qty: 11 }])).error === "550 Coins ค้างรับอีก 10 รับเกินนั้นไม่ได้", "nothing is delivered beyond what was ordered");
check(Boolean(applyPurchaseOrderAction(order, "deliver", stockDelivery([{ itemId: 99, qty: 1 }])).error), "only the order's own packs are delivered");
check(Boolean(applyPurchaseOrderAction(order, "deliver", stockDelivery([])).error), "a delivery has at least one pack");
check(Boolean(applyPurchaseOrderAction(order, "deliver", { delivery: { lines: [{ itemId: 7, qty: 1 }] } }).error), "a delivery says how it came");
check(Boolean(applyPurchaseOrderAction(order, "deliver", { delivery: { method: "stock", proofUrl: "file://x", lines: [{ itemId: 7, qty: 1 }] } }).error), "a proof link must be http(s)");

const topup = { method: "topup", lines: [{ itemId: 7, qty: 10 }], topupAccount: "razer@example.com", balanceBefore: "1.67", balanceAfter: "351.67", expected: "350", proofUrl: "https://drive.google.com/x" };
const topped = applyPurchaseOrderAction(order, "deliver", { delivery: topup });
check(!topped.error && topped.delivery.balanceAfter === "351.67" && topped.delivery.expected === "350", "a top-up keeps the account and its balance before and after");
check(Boolean(applyPurchaseOrderAction(order, "deliver", { delivery: { ...topup, topupAccount: "" } }).error), "a top-up names the account");
check(Boolean(applyPurchaseOrderAction(order, "deliver", { delivery: { ...topup, balanceAfter: "1" } }).error), "a top-up's balance must go up");
check(topupCheck(topup).got === "350" && topupCheck(topup).matches === true, "after − before is what the top-up brought");
check(topupCheck({ ...topup, balanceAfter: "341.67" }).short === "10", "a short top-up says how much is missing");
check(topupCheck({ ...topup, expected: "" }).matches === null, "no amount due, no verdict");
check(Boolean(applyPurchaseOrderAction(order, "deliver", { delivery: { method: "code", lines: [{ itemId: 7, qty: 1 }] } }).error), "cards come with the supplier's order number");
check(applyPurchaseOrderAction(order, "deliver", { delivery: { method: "code", supplierRef: "47418137", expiresOn: "2027-01-31", lines: [{ itemId: 7, qty: 1 }] } }).delivery.expiresOn === "2027-01-31", "cards keep their expiry date");

const waiting = { ...order, status: "delivered", delivery: { lines: [{ itemId: 7, qty: 4 }], fromStatus: "accepted" } };
const checkedPart = applyPurchaseOrderAction(waiting, "verify");
check(checkedPart.status === "partial" && checkedPart.received[0].qty === 4, "a checked delivery of some leaves the order part-received");
const checkedAll = applyPurchaseOrderAction({ ...waiting, delivery: { lines: [{ itemId: 7, qty: 10 }, { itemId: 8, qty: 2 }] } }, "verify");
check(checkedAll.status === "received", "a checked delivery of everything closes the order");
const rest = applyPurchaseOrderAction({ ...waiting, lines: [{ ...order.lines[0], qtyReceived: 4 }, { ...order.lines[1], qtyReceived: 2 }], delivery: { lines: [{ itemId: 7, qty: 6 }] } }, "verify");
check(rest.status === "received", "the rest of a part-received order closes it");
check(Boolean(applyPurchaseOrderAction(waiting, "reject_delivery").error), "a rejected delivery says what was wrong");
check(applyPurchaseOrderAction(waiting, "reject_delivery", { note: "ยอดขาด 10" }).status === "accepted", "a rejected delivery sends the order back to the step it was at");
check(Boolean(applyPurchaseOrderAction({ ...waiting, delivery: null }, "verify").error), "there must be a delivery to check");
check(purchaseOrderRemaining([{ itemId: 7, qtyOrdered: 10, qtyReceived: 4 }])[7] === 6, "what is still to come is ordered minus received");

check(Boolean(applyPurchaseOrderAction(order, "request_refund", { refundAmount: "100" }).error), "a refund request needs a reason");
check(Boolean(applyPurchaseOrderAction(order, "request_refund", { refundAmount: "600", note: "ซัพไม่มีของ" }).error), "a refund cannot exceed what was paid");
const asked = applyPurchaseOrderAction(order, "request_refund", { refundAmount: "500", note: "ซัพไม่มีของ" });
check(asked.status === "refund_requested" && asked.refundAmount === "500", "a refund request keeps the amount asked for");
check(applyPurchaseOrderAction({ ...order, status: "refund_requested" }, "refund").status === "refunded", "money back closes the refund");

check(purchaseOrderThb({ amount: 100, currency: "THB" }) === 100, "THB counts as itself");
check(purchaseOrderThb({ amount: 10, currency: "USDT", rateThb: "33.255" }) === 332.55, "other currencies use the order's rate");
check(purchaseOrderThb({ amount: 10, currency: "USDT", rateThb: "" }) === null, "no rate, no THB figure");

check(normalizeStockCode("purchase-orders") === "" && normalizeStockCode("po1") === "po1", "no account code can hide the purchase orders page");

const repository = read("../src/server/stock-purchase-order-repository.js");
check(repository.includes("FOR UPDATE") && repository.includes("applyPurchaseOrderAction"), "a step is checked against the order read under a lock");
check(repository.includes("insertStockMove(client"), "checking a delivery writes the stock move in the same transaction");
check(repository.includes("stock_purchase_order_deliveries"), "deliveries keep their proof in their own table");
const route = read("../src/app/api/stock/purchase-orders/[id]/actions/route.js");
check(route.includes("requireStockEditor"), "only Stock editors take steps on an order");

console.log(`stock-purchase-orders: ${passed} passed`);
