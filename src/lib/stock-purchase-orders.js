// Purchase orders for Stock: what was asked for, paid, delivered, checked and
// refunded, so each purchase shows the step it is at instead of a colour in a sheet.
//   รออนุมัติ → รอโอนเงิน → โอนแล้ว รอซัพตอบ → ซัพรับแล้ว รอของ → ของมาแล้ว รอคนตรวจ → (ตรวจผ่าน) ได้ของไม่ครบ / ได้ของครบ
// Three steps need a second person, so no one alone can move money or count goods:
//   approve  someone other than who made the order, before any money goes out
//   verify   someone other than who recorded the delivery, before it counts in stock
//   refund   someone other than who asked for the refund confirms the money came back
// A delivery carries its proof the way the sheets do: the account topped up with
// its balance before and after (Razer, iTunes, Roblox), card codes with the
// supplier's order number (OffGamer), or goods into a stock account. Checking a
// delivery is the only step that touches balances: it writes an "in" move
// (src/lib/stock.js) for what the delivery brought, at the order's unit cost.
// Pure: the same rules run in the API and the tests.
import { normalizeStockMoney } from "@/lib/stock";
import { fromWalletUnits, normalizeWalletAmount, toWalletUnits } from "@/lib/stock-wallets";

export const PO_STATUSES = ["requested", "approved", "paid", "accepted", "delivered", "partial", "received", "refund_requested", "refunded", "cancelled"];
export const PO_STATUS_LABELS = {
  requested: "รออนุมัติ",
  approved: "รอโอนเงิน",
  paid: "โอนแล้ว รอซัพตอบ",
  accepted: "ซัพรับแล้ว รอของ",
  delivered: "ของมาแล้ว รอคนตรวจ",
  partial: "ได้ของไม่ครบ",
  received: "ได้ของครบ",
  refund_requested: "รอเงินคืน",
  refunded: "คืนเงินแล้ว",
  cancelled: "ยกเลิก",
};
/** Statuses where something is still owed: money out, goods, a check or a refund not back. */
export const PO_OPEN_STATUSES = ["requested", "approved", "paid", "accepted", "delivered", "partial", "refund_requested"];
/** Statuses where goods are still to come. */
export const PO_AWAITING_GOODS = ["paid", "accepted", "delivered", "partial"];

export const PO_ACTIONS = ["approve", "pay", "accept", "deliver", "verify", "reject_delivery", "request_refund", "refund", "cancel"];
export const PO_ACTION_LABELS = {
  approve: "อนุมัติใบนี้",
  pay: "บันทึกการจ่ายเงิน",
  accept: "ซัพตอบรับออเดอร์แล้ว",
  deliver: "ได้ของจากซัพแล้ว",
  verify: "ตรวจแล้ว ถูกต้อง",
  reject_delivery: "ไม่ถูกต้อง ให้กรอกใหม่",
  receive: "รับของเข้า stock",
  request_refund: "ซัพไม่ส่งของ ขอเงินคืน",
  refund: "ได้เงินคืนแล้ว",
  cancel: "ยกเลิก",
  create: "สร้างใบสั่งซื้อ",
};
/** One line per button: when to press it, for whoever is working the order. */
export const PO_ACTION_HINTS = {
  approve: "เช็คแล้วว่าซื้อได้ → อนุมัติให้โอนเงิน",
  pay: "โอนเงินให้ซัพแล้ว → จดว่าจ่ายจากไหน เท่าไหร่",
  accept: "ซัพยืนยันว่ารับออเดอร์แล้ว แต่ยังไม่ได้ของ → ใส่เลขออเดอร์ของซัพ (ไม่ต้องแนบอะไร)",
  deliver: "ของเข้ามาแล้ว (เติมเข้าบัญชี / ได้โค้ด / ของเข้าไอดี) → กรอกว่าได้อะไรมาเท่าไหร่ แล้วให้อีกคนตรวจ",
  verify: "เช็คแล้วว่าของที่กรอกไว้ตรงจริง → ยอดเข้า stock ทันที",
  reject_delivery: "ของที่กรอกไว้ไม่ตรงกับที่ได้จริง → ตีกลับให้คนกรอกแก้ใหม่ (ยังไม่เข้า stock)",
  request_refund: "ซัพส่งของไม่ได้ / ไม่ครบ → ขอเงินคืนจากซัพ",
  refund: "เงินคืนจากซัพเข้ามาแล้ว → ปิดใบ",
  cancel: "ไม่ซื้อแล้ว (ยังไม่ได้โอนเงิน) → ยกเลิกใบ",
};
const ACTION_FROM = {
  approve: ["requested"],
  pay: ["approved"],
  accept: ["paid"],
  deliver: ["paid", "accepted", "partial"],
  verify: ["delivered"],
  reject_delivery: ["delivered"],
  request_refund: ["paid", "accepted", "partial"],
  refund: ["refund_requested"],
  cancel: ["requested", "approved"],
};
/** Steps a second person must take, and whose step they check. */
export const PO_SECOND_PERSON = {
  approve: { of: "createdById", error: "คนอนุมัติต้องเป็นคนละคนกับคนสร้างใบสั่งซื้อ" },
  verify: { of: "recordedById", error: "คนตรวจต้องเป็นคนละคนกับคนที่กรอกของที่ได้จากซัพ" },
  refund: { of: "refundRequestedById", error: "คนยืนยันเงินคืนต้องเป็นคนละคนกับคนขอคืนเงิน" },
};

export const DELIVERY_METHODS = ["topup", "code", "stock"];
export const DELIVERY_METHOD_LABELS = { topup: "เติมเข้าบัญชี", code: "โค้ด / การ์ด", stock: "ของเข้าไอดี stock" };
export const DELIVERY_STATUS_LABELS = { pending: "รอตรวจ", verified: "ตรวจแล้ว", rejected: "ไม่ผ่าน" };

const PO_CURRENCY = /^[A-Z]{3,5}$/;
const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** The actions a person can take on an order in this status. */
export function purchaseOrderActions(status) {
  return PO_ACTIONS.filter((action) => ACTION_FROM[action].includes(status));
}

/** "https://…" kept, anything else (javascript:, text) dropped. */
export function normalizeReceiptUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 1000) : null;
  } catch {
    return null;
  }
}

/**
 * A new order as typed → { order, lines } ready to store, or { error } in Thai.
 * `itemIds` are the packs of the chosen stock account.
 */
export function validatePurchaseOrder(input, itemIds = []) {
  const supplier = clean(input?.supplier, 120);
  if (!supplier) return { error: "ใส่ชื่อซัพพลายเออร์หรือร้านที่ซื้อ" };
  const currency = clean(input?.currency, 5).toUpperCase() || "THB";
  if (!PO_CURRENCY.test(currency)) return { error: "สกุลเงินใช้ตัวอักษร 3–5 ตัว เช่น THB, USDT" };
  const amount = normalizeWalletAmount(input?.amount);
  if (!amount) return { error: "ใส่ยอดที่ต้องจ่ายมากกว่า 0" };
  let rate = normalizeRate(input?.rateThb);
  if (rate === null) return { error: "เรทต้องเป็นตัวเลขมากกว่า 0" };
  // The supplier sheet's Product Rate (CNY per 1 unit of the order's currency) and
  // CNY Rate (THB per 1 CNY): when known they set the THB rate, USD → CNY → THB.
  const productRate = currency === "CNY" ? "" : normalizeRate(input?.productRate);
  if (productRate === null) return { error: "Product Rate ต้องเป็นตัวเลขมากกว่า 0" };
  const cnyRate = currency === "THB" ? "" : normalizeRate(input?.cnyRate);
  if (cnyRate === null) return { error: "CNY Rate ต้องเป็นตัวเลขมากกว่า 0" };
  if (productRate && !cnyRate) return { error: "ใส่ Product Rate แล้ว ต้องใส่ CNY Rate (บาทต่อ 1 หยวน) ด้วย" };
  if (currency === "CNY" && cnyRate) rate = cnyRate;
  else if (productRate && cnyRate) rate = String(Math.round(Number(productRate) * Number(cnyRate) * 1e6) / 1e6);
  const receiptUrl = normalizeReceiptUrl(input?.receiptUrl);
  if (receiptUrl === null) return { error: "ลิงก์ใบเสร็จต้องขึ้นต้นด้วย https://" };

  const allowed = new Set(itemIds.map(Number));
  const seen = new Set();
  const lines = [];
  for (const line of input?.lines || []) {
    const itemId = Number(line.itemId);
    const qty = Number(line.qty);
    if (!allowed.has(itemId)) return { error: "เลือกแพ็คของไอดีนี้ให้ครบทุกแถว" };
    if (seen.has(itemId)) return { error: "แพ็คเดียวกันใส่ได้แถวเดียว" };
    seen.add(itemId);
    if (!Number.isInteger(qty) || qty <= 0) return { error: "จำนวนต้องเป็นจำนวนเต็มมากกว่า 0" };
    const unitCost = normalizeStockMoney(line.unitCost);
    lines.push({ itemId, qty, unitCost });
  }
  if (!lines.length) return { error: "ใส่อย่างน้อยหนึ่งแพ็ค" };

  return {
    order: {
      supplier,
      paymentChannel: clean(input?.paymentChannel, 120),
      buyer: clean(input?.buyer, 120),
      currency,
      amount,
      rateThb: rate,
      productRate,
      cnyRate,
      receiptUrl,
      note: clean(input?.note, 1000),
    },
    lines,
  };
}

// A rate is "" when blank, null when not a positive number; up to 6 places (1 IDR ≈ 0.0021 THB).
function normalizeRate(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return "";
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0) return null;
  return String(Math.round(number * 1e6) / 1e6);
}

/** What is still to come per line: ordered − received. */
export function purchaseOrderRemaining(lines) {
  return Object.fromEntries((lines || []).map((line) => [line.itemId, Math.max(0, line.qtyOrdered - line.qtyReceived)]));
}

/** A top-up's balance before/after → { got, matches, short } against what was due, or null when unreadable. */
export function topupCheck({ balanceBefore, balanceAfter, expected }) {
  const before = toWalletUnits(balanceBefore);
  const after = toWalletUnits(balanceAfter);
  if (before === null || after === null) return null;
  const got = after - before;
  const due = expected === "" || expected == null ? null : toWalletUnits(expected);
  return { got: fromWalletUnits(got), matches: due === null ? null : got === due, short: due === null ? null : fromWalletUnits(due - got) };
}

/**
 * One step on an order → { status, ...fields } to store, or { error } in Thai.
 * `order` is { status, amount, createdById, refundRequestedById, lines: [{ itemId, qtyOrdered, qtyReceived, label }],
 * delivery: { lines, fromStatus, recordedById } }. `actor` is { id } of who takes the step; see PO_SECOND_PERSON.
 * accept: `input.supplierRef`, the supplier's order number.
 * deliver: `input.delivery` { method, lines [{ itemId, qty }], supplierRef, topupAccount,
 *          balanceBefore, balanceAfter, expected, proofUrl, expiresOn } — never more than is still to come.
 * verify / reject_delivery: `order.delivery` is the delivery waiting { lines, fromStatus };
 *          a rejection needs a reason and sends the order back to the step it was at.
 * request_refund: `input.refundAmount` (≤ the amount paid) and a reason in `input.note`.
 */
export function applyPurchaseOrderAction(order, action, input = {}, actor = null) {
  if (!PO_ACTIONS.includes(action)) return { error: "ขั้นตอนไม่ถูกต้อง" };
  if (!ACTION_FROM[action].includes(order.status)) {
    return { error: `ใบนี้อยู่ขั้น "${PO_STATUS_LABELS[order.status] || order.status}" ทำ "${PO_ACTION_LABELS[action]}" ไม่ได้` };
  }
  const rule = PO_SECOND_PERSON[action];
  if (rule) {
    const first = action === "verify" ? order.delivery?.recordedById : order[rule.of];
    if (actor?.id != null && first != null && String(actor.id) === String(first)) return { error: rule.error };
  }
  const note = clean(input.note, 500);

  if (action === "approve") return { status: "approved", note };
  if (action === "pay") return { status: "paid", note };
  if (action === "cancel") return { status: "cancelled", note };
  if (action === "refund") return { status: "refunded", note };
  if (action === "accept") {
    const supplierRef = clean(input.supplierRef, 120);
    if (!supplierRef) return { error: "ใส่เลขออเดอร์ของซัพ" };
    return { status: "accepted", supplierRef, note };
  }
  if (action === "request_refund") {
    if (!note) return { error: "ขอคืนเงินต้องใส่เหตุผล" };
    const refund = normalizeWalletAmount(input.refundAmount);
    if (!refund) return { error: "ใส่ยอดที่ขอคืนมากกว่า 0" };
    if (toWalletUnits(refund) > toWalletUnits(order.amount)) return { error: `ขอคืนได้ไม่เกินยอดที่จ่าย ${fromWalletUnits(toWalletUnits(order.amount))}` };
    return { status: "refund_requested", refundAmount: refund, note };
  }
  if (action === "reject_delivery") {
    if (!order.delivery) return { error: "ไม่พบการส่งของที่รอตรวจ" };
    if (!note) return { error: "ใส่เหตุผลว่าของไม่ตรงตรงไหน" };
    return { status: order.delivery.fromStatus || "paid", note };
  }
  if (action === "verify") {
    if (!order.delivery) return { error: "ไม่พบการส่งของที่รอตรวจ" };
    const checked = receivedLines(order, order.delivery.lines);
    return checked.error ? checked : { ...checked, note };
  }

  // deliver
  const delivery = input.delivery || {};
  const method = DELIVERY_METHODS.includes(delivery.method) ? delivery.method : null;
  if (!method) return { error: "เลือกวิธีส่งของ" };
  const checked = receivedLines(order, delivery.lines);
  if (checked.error) return checked;
  const proofUrl = normalizeReceiptUrl(delivery.proofUrl);
  if (proofUrl === null) return { error: "ลิงก์รูปหลักฐานต้องขึ้นต้นด้วย https://" };
  const record = {
    method,
    lines: checked.received,
    supplierRef: clean(delivery.supplierRef, 120),
    topupAccount: "",
    balanceBefore: "",
    balanceAfter: "",
    expected: "",
    proofUrl,
    expiresOn: "",
    fromStatus: order.status,
  };
  if (method === "topup") {
    record.topupAccount = clean(delivery.topupAccount, 200);
    if (!record.topupAccount) return { error: "ใส่บัญชีที่เติม (TOP UP MAIL / ID)" };
    const before = normalizeWalletAmount(delivery.balanceBefore, { allowZero: true });
    const after = normalizeWalletAmount(delivery.balanceAfter, { allowZero: true });
    if (!before || !after) return { error: "ใส่ยอดก่อนเติมและหลังเติม" };
    if (toWalletUnits(after) <= toWalletUnits(before)) return { error: "ยอดหลังเติมต้องมากกว่ายอดก่อนเติม" };
    const expected = normalizeWalletAmount(delivery.expected);
    if (expected === null) return { error: "ยอดที่ควรได้ต้องเป็นตัวเลข" };
    Object.assign(record, { balanceBefore: before, balanceAfter: after, expected });
  }
  if (method === "code") {
    if (!record.supplierRef) return { error: "ใส่เลข ORDER ของซัพ" };
    const expiresOn = String(delivery.expiresOn || "").trim();
    if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return { error: "วันหมดอายุไม่ถูกต้อง" };
    record.expiresOn = expiresOn;
  }
  return { status: "delivered", delivery: record, note };
}

// What a delivery brings, checked against what is still to come → { status, received } or { error }.
function receivedLines(order, lines) {
  const remaining = purchaseOrderRemaining(order.lines);
  const byId = new Map((order.lines || []).map((line) => [line.itemId, line]));
  const seen = new Set();
  const received = [];
  for (const line of lines || []) {
    const itemId = Number(line.itemId);
    const qty = Number(line.qty);
    if (!qty) continue;
    if (!byId.has(itemId)) return { error: "มีแพ็คที่ไม่อยู่ในใบสั่งซื้อนี้" };
    if (seen.has(itemId)) return { error: "แพ็คเดียวกันใส่ได้แถวเดียว" };
    seen.add(itemId);
    if (!Number.isInteger(qty) || qty < 0) return { error: "จำนวนที่ได้ต้องเป็นจำนวนเต็มมากกว่า 0" };
    if (qty > remaining[itemId]) return { error: `${byId.get(itemId).label || "แพ็คนี้"} ค้างรับอีก ${remaining[itemId]} รับเกินนั้นไม่ได้` };
    received.push({ itemId, qty });
  }
  if (!received.length) return { error: "ใส่จำนวนที่ได้รับอย่างน้อยหนึ่งแพ็ค" };
  const done = (order.lines || []).every((line) => line.qtyReceived + (received.find((r) => r.itemId === line.itemId)?.qty || 0) >= line.qtyOrdered);
  return { status: done ? "received" : "partial", received };
}

/** Amount in CNY: the amount itself for CNY orders, amount × Product Rate when that is known, else null. */
export function purchaseOrderCny({ amount, currency, productRate }) {
  if (amount == null) return null;
  if (currency === "CNY") return Math.round(Number(amount) * 100) / 100;
  if (productRate == null || productRate === "") return null;
  return Math.round(Number(amount) * Number(productRate) * 100) / 100;
}

/** Amount in THB when a rate is known (THB orders count 1:1), else null. */
export function purchaseOrderThb({ amount, currency, rateThb }) {
  if (amount == null) return null;
  if (currency === "THB") return Math.round(Number(amount) * 100) / 100;
  if (rateThb == null || rateThb === "") return null;
  return Math.round(Number(amount) * Number(rateThb) * 100) / 100;
}

/** How far apart a payment and its order may be, in days, to count as "same time". */
export const LINK_DAYS = 3;
const linkText = (value) => String(value ?? "").toLowerCase().replace(/[\s_\-·.]+/g, "");

/**
 * Orders a payment made outside an order (wallet page, sheet import) could
 * belong to, best first. Only orders approved and waiting for money count, in
 * the payment's currency, and only when the order's amount is what was paid
 * (with or without the fee): a different amount is never offered. Each says why else it fits:
 *   name    its supplier, game or stock account appears in the payment's text
 *   date    the payment is within LINK_DAYS of the order being made
 * `sure` = name or date. Nothing links by itself: a person picks.
 */
export function walletPaymentCandidates(entry, orders = []) {
  if (!entry || entry.kind !== "payment" || entry.orderId) return [];
  if (["awaiting_approval", "rejected"].includes(entry.status)) return [];
  const leg = entry.legs?.[0];
  const total = leg ? toWalletUnits(String(leg.amount).replace(/^-/, "")) : null;
  if (!leg || total === null) return [];
  const paid = total - (toWalletUnits(leg.fee) ?? 0n);
  const text = linkText([entry.title, entry.seller, entry.destinationAccount, entry.note, entry.channel].join(" "));
  const when = new Date(entry.occurredAt).getTime();
  return orders
    .filter((order) => order.status === "approved" && order.currency === leg.currency)
    .map((order) => {
      const amountMatch = walletPaymentAmountMatches(order.amount, total, paid);
      const nameMatch = [order.supplier, order.gameName, order.accountCode].map(linkText).some((word) => word.length >= 3 && text.includes(word));
      const days = Math.abs(when - new Date(order.createdAt).getTime()) / 86400000;
      const dateMatch = Number.isFinite(days) && days <= LINK_DAYS;
      return {
        orderId: order.id,
        code: order.code,
        supplier: order.supplier,
        accountCode: order.accountCode,
        amount: order.amount,
        currency: order.currency,
        amountMatch,
        nameMatch,
        dateMatch,
        sure: amountMatch && (nameMatch || dateMatch),
        score: (amountMatch ? 4 : 0) + (nameMatch ? 2 : 0) + (dateMatch ? 1 : 0),
      };
    })
    .filter((candidate) => candidate.amountMatch)
    .sort((a, b) => b.score - a.score || b.orderId - a.orderId);
}

/** An order's amount equals a payment's total (fee included) or what reached the supplier. */
export function walletPaymentAmountMatches(orderAmount, total, paid) {
  const amount = toWalletUnits(orderAmount);
  return amount !== null && (amount === paid || amount === total);
}

/** The one order to offer as a single click, or null when none or more than one is sure. */
export function bestWalletPaymentMatch(candidates = []) {
  const sure = candidates.filter((candidate) => candidate.sure);
  return sure.length === 1 ? sure[0] : null;
}

/**
 * THB cost per unit for each line, split from the order's THB amount by each
 * pack's USD value: a 4.8 USD pack carries four times the cost of a 1.2 USD
 * one. Lines are [{ itemId, qty, unitCost }]; `unitUsdById` maps itemId → USD.
 * Only when every line's cost is blank and every pack has a USD value; any
 * other case returns the lines as they are, so typed costs always win.
 */
export function allocatePurchaseOrderCosts(lines = [], unitUsdById = {}, amountThb = null) {
  if (amountThb == null || !Number.isFinite(Number(amountThb)) || Number(amountThb) <= 0) return lines;
  if (!lines.length || lines.some((line) => line.unitCost !== "" && line.unitCost != null)) return lines;
  const usd = lines.map((line) => Number(unitUsdById[line.itemId]));
  if (usd.some((value) => !Number.isFinite(value) || value <= 0)) return lines;
  const totalUsd = lines.reduce((sum, line, index) => sum + usd[index] * Number(line.qty), 0);
  if (!(totalUsd > 0)) return lines;
  const perUsd = Number(amountThb) / totalUsd;
  return lines.map((line, index) => ({ ...line, unitCost: String(Math.round(usd[index] * perUsd * 100) / 100), costAllocated: true }));
}
