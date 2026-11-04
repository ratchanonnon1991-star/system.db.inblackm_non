import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyPurchaseOrderAction,
  normalizeReceiptUrl,
  purchaseOrderActions,
  purchaseOrderRemaining,
  purchaseOrderThb,
  topupCheck,
  validatePurchaseOrder,
} from "../src/lib/stock-purchase-orders.js";
import { normalizeStockCode } from "../src/lib/stock.js";

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

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
check(applyPurchaseOrderAction({ ...order, status: "approved" }, "pay").status === "paid", "paying moves an approved order on");
const maker = { id: 5 };
const other = { id: 9 };
check(applyPurchaseOrderAction({ ...order, status: "requested", createdById: 5 }, "approve", {}, maker).error === "คนอนุมัติต้องเป็นคนละคนกับคนสร้างใบสั่งซื้อ", "the maker cannot approve their own order");
check(applyPurchaseOrderAction({ ...order, status: "requested", createdById: 5 }, "approve", {}, other).status === "approved", "someone else approves it");
check(Boolean(applyPurchaseOrderAction({ ...order, status: "delivered", delivery: { lines: [{ itemId: 7, qty: 1 }], recordedById: 5 } }, "verify", {}, maker).error), "whoever recorded a delivery cannot check it");
check(applyPurchaseOrderAction({ ...order, status: "delivered", delivery: { lines: [{ itemId: 7, qty: 1 }], recordedById: 5 } }, "verify", {}, other).status === "partial", "someone else checks the delivery");
check(Boolean(applyPurchaseOrderAction({ ...order, status: "refund_requested", refundRequestedById: 5 }, "refund", {}, maker).error), "whoever asked for a refund cannot confirm it came back");
check(applyPurchaseOrderAction({ ...order, status: "refund_requested", refundRequestedById: 5 }, "refund", {}, other).status === "refunded", "someone else confirms the refund");
check(!applyPurchaseOrderAction({ ...order, status: "approved", createdById: 5 }, "pay", {}, maker).error, "the maker may still record the payment once approved");
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
