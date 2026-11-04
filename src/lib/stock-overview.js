// The Stock front page: what needs doing today, from orders, wallets and packs.
// Pure: the page passes in what the repositories already return.
import { purchaseOrderRemaining } from "@/lib/stock-purchase-orders";
import { fromWalletUnits, toWalletUnits } from "@/lib/stock-wallets";

const DAY = 24 * 60 * 60 * 1000;
const OPEN_FOR_GOODS = ["requested", "approved", "paid", "accepted", "delivered", "partial"];

/** Whole days since `value` (0 on the same day), or null. */
export function daysSince(value, now = Date.now()) {
  if (!value) return null;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / DAY)) : null;
}

/**
 * { followUps, lowPacks, wallets } for the front page.
 *   followUps  per step (requested, paid, partial, refund_requested): count, orders oldest first,
 *              THB total where known, units still to come, refunds asked per currency
 *   lowPacks   packs that are low or empty, each with the open orders that will refill it
 *   wallets    passed through, for the balances
 *   shortfalls currencies where orders waiting to be paid need more than any one wallet holds
 */
export function buildStockOverview({ orders = [], wallets = [], accounts = [] }, now = Date.now()) {
  const step = (status) => {
    const list = orders.filter((order) => order.status === status)
      .map((order) => ({ ...order, waitingDays: daysSince(["requested", "approved"].includes(status) ? order.createdAt : order.paidAt || order.updatedAt, now) }))
      .sort((a, b) => (b.waitingDays ?? 0) - (a.waitingDays ?? 0));
    return { count: list.length, orders: list, oldestDays: list[0]?.waitingDays ?? null };
  };
  const paid = step("paid");
  const partial = step("partial");
  const refund = step("refund_requested");
  const requested = step("requested");
  const approved = step("approved");
  const accepted = step("accepted");
  const delivered = step("delivered");
  const thb = (list) => list.reduce((sum, order) => sum + (order.amountThb ?? 0), 0);
  const stillToCome = partial.orders.reduce((sum, order) => sum + Object.values(purchaseOrderRemaining(order.lines)).reduce((a, b) => a + b, 0), 0);
  const refundByCurrency = {};
  for (const order of refund.orders) {
    refundByCurrency[order.currency] = (refundByCurrency[order.currency] ?? 0n) + toWalletUnits(order.refundAmount ?? 0);
  }

  // Which open orders will refill a pack: by stock item, units still to come.
  const incoming = new Map();
  for (const order of orders.filter((item) => OPEN_FOR_GOODS.includes(item.status))) {
    const remaining = purchaseOrderRemaining(order.lines);
    for (const line of order.lines) {
      if (!remaining[line.itemId]) continue;
      const list = incoming.get(line.itemId) || [];
      list.push({ code: order.code, id: order.id, status: order.status, qty: remaining[line.itemId] });
      incoming.set(line.itemId, list);
    }
  }
  const refunding = new Set(refund.orders.flatMap((order) => order.lines.map((line) => line.itemId)));
  const lowPacks = accounts.filter((account) => account.status !== "closed")
    .flatMap((account) => account.items.filter((item) => item.tone !== "ok").map((item) => ({
      accountCode: account.code,
      gameName: account.gameName,
      itemId: item.id,
      label: item.label,
      left: item.left,
      lowAt: item.lowAt,
      tone: item.tone,
      incoming: incoming.get(item.id) || [],
      refunding: refunding.has(item.id),
    })))
    .sort((a, b) => (a.tone === b.tone ? a.left - b.left : a.tone === "empty" ? -1 : 1));

  // Orders not yet paid, by currency, against the most any one wallet holds in it.
  const toPay = {};
  for (const order of [...requested.orders, ...approved.orders]) toPay[order.currency] = (toPay[order.currency] ?? 0n) + toWalletUnits(order.amount);
  const best = {};
  for (const wallet of wallets) {
    for (const item of wallet.balances) {
      const units = toWalletUnits(item.balance);
      if (best[item.currency] == null || units > best[item.currency].units) best[item.currency] = { units, wallet: wallet.name };
    }
  }
  const shortfalls = Object.entries(toPay)
    .filter(([currency, need]) => best[currency] != null && best[currency].units < need)
    .map(([currency, need]) => ({ currency, need: fromWalletUnits(need), have: fromWalletUnits(best[currency].units), wallet: best[currency].wallet }));

  return {
    followUps: {
      requested,
      approved,
      accepted,
      delivered,
      paid: { ...paid, thb: thb(paid.orders) },
      partial: { ...partial, thb: thb(partial.orders), stillToCome },
      refund_requested: { ...refund, byCurrency: Object.entries(refundByCurrency).map(([currency, units]) => ({ currency, amount: fromWalletUnits(units) })) },
    },
    lowPacks,
    wallets,
    shortfalls,
    openCount: requested.count + approved.count + paid.count + accepted.count + delivered.count + partial.count + refund.count,
  };
}
