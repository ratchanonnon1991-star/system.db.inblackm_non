// What each supplier is owed or still owes us, from the purchase orders (the 1.1
// sheet's job: the stock ordered and what has to be paid to each supplier).
//   toPay    orders not paid yet (รออนุมัติ, รอโอนเงิน): money we still have to send
//   goods    paid but not all goods in: the paid amount × the share of packs still to come
//   refund   refunds asked for and not back yet
//   bought   every order that was not cancelled, for scale
// Amounts stay per currency; THB is added up only where an order has a rate.
// Pure: the page and the tests share it.

const TO_PAY = new Set(["requested", "approved"]);
const AWAITING = new Set(["paid", "accepted", "delivered", "partial"]);

const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const add = (bag, currency, amount) => {
  if (!amount) return;
  bag[currency] = round((bag[currency] || 0) + amount, 8);
};

/** The share of an order's packs still to come (0…1); 1 when it has no lines. */
export function stillToComeShare(order) {
  const ordered = (order.lines || []).reduce((sum, line) => sum + (Number(line.qtyOrdered) || 0), 0);
  if (!ordered) return 1;
  const received = (order.lines || []).reduce((sum, line) => sum + Math.min(Number(line.qtyReceived) || 0, Number(line.qtyOrdered) || 0), 0);
  return Math.max(0, ordered - received) / ordered;
}

const thbRate = (order) => (order.currency === "THB" ? 1 : Number(order.rateThb) || null);

/**
 * orders (as listPurchaseOrders returns them) → one row per supplier, most owed first:
 * { supplier, toPay, goods, refund, bought: { CUR: amount }, toPayThb, goodsThb, refundThb,
 *   openCount, orderCount, lastAt, missingRate } — `missingRate` when an open order has no THB rate.
 */
export function supplierBalances(orders = []) {
  const bySupplier = new Map();
  for (const order of orders) {
    const name = String(order.supplier || "").trim() || "(ไม่ระบุ)";
    const key = name.toLowerCase();
    if (!bySupplier.has(key)) {
      bySupplier.set(key, { supplier: name, toPay: {}, goods: {}, refund: {}, bought: {}, toPayThb: 0, goodsThb: 0, refundThb: 0, openCount: 0, orderCount: 0, lastAt: null, missingRate: false });
    }
    const row = bySupplier.get(key);
    const amount = Number(order.amount) || 0;
    const rate = thbRate(order);
    const at = order.createdAt ? new Date(order.createdAt).toISOString() : null;
    if (at && (!row.lastAt || at > row.lastAt)) row.lastAt = at;
    if (order.status === "cancelled") continue;
    row.orderCount += 1;
    add(row.bought, order.currency, amount);

    let open = 0;
    if (TO_PAY.has(order.status)) {
      open = amount;
      add(row.toPay, order.currency, open);
      if (rate) row.toPayThb += open * rate;
    } else if (AWAITING.has(order.status)) {
      open = amount * stillToComeShare(order);
      add(row.goods, order.currency, open);
      if (rate) row.goodsThb += open * rate;
    } else if (order.status === "refund_requested") {
      open = Number(order.refundAmount) || amount;
      add(row.refund, order.currency, open);
      if (rate) row.refundThb += open * rate;
    }
    if (open) {
      row.openCount += 1;
      if (!rate) row.missingRate = true;
    }
  }
  const rows = [...bySupplier.values()].map((row) => ({
    ...row, toPayThb: round(row.toPayThb), goodsThb: round(row.goodsThb), refundThb: round(row.refundThb),
  }));
  const weight = (row) => row.toPayThb + row.goodsThb + row.refundThb;
  return rows.sort((a, b) => weight(b) - weight(a) || b.openCount - a.openCount || String(b.lastAt).localeCompare(String(a.lastAt)) || a.supplier.localeCompare(b.supplier));
}

/** { CUR: amount } → "1,200 USDT · 500 THB"; "" when empty. */
export function formatCurrencyBag(bag, format = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })) {
  return Object.entries(bag || {}).filter(([, amount]) => amount).map(([currency, amount]) => `${format(amount)} ${currency}`).join(" · ");
}
