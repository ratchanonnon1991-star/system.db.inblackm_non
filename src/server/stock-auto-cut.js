// Auto cut: every few minutes, cut the stock of new orders the system is sure
// about (src/lib/stock-pending-orders.js autoCutPlan), as cuts that wait for a
// person to confirm or cancel on รอตัด. Only accounts with auto cut turned on
// take part, and only orders made after it was turned on. Orders are read
// from the shared production DB (SELECT only); the cuts go in this app's own
// stock tables. STOCK_AUTO_CUT=false stops the scheduler.
import { autoCutPlan } from "@/lib/stock-pending-orders";
import { listPendingStockOrders } from "@/server/stock-pending-orders";
import { recordStockMove } from "@/server/stock-repository";

const SCHEDULER_KEY = Symbol.for("stock.autoCutScheduler");
export const STOCK_AUTO_CUT_EVERY_MS = 3 * 60 * 1000;
/** New orders only: the window the scheduler looks back over. */
const LOOKBACK_DAYS = 2;
export const STOCK_AUTO_CUT_ACTOR = { id: null, name: "ระบบตัดอัตโนมัติ" };

/** One pass. Returns { cut, skipped, failed } counts; never throws. */
export async function runStockAutoCut({ list = listPendingStockOrders, record = recordStockMove } = {}) {
  const summary = { cut: 0, skipped: 0, failed: 0 };
  let data;
  try {
    data = await list({ days: LOOKBACK_DAYS });
  } catch (error) {
    console.error("[stock-auto-cut] could not list orders", error);
    summary.failed += 1;
    return summary;
  }
  if (data.error || !data.accounts.some((account) => account.autoCut)) return summary;
  const byId = new Map(data.accounts.map((account) => [account.id, account]));
  // Oldest first, so the units left go to the orders that came first.
  for (const order of [...data.orders].reverse()) {
    const plan = autoCutPlan(order, byId);
    if (!plan) {
      summary.skipped += 1;
      continue;
    }
    try {
      await record({
        accountId: plan.accountId,
        kind: "out",
        queue: order.ref,
        note: [order.game, order.pack].filter(Boolean).join(" · ").slice(0, 200),
        sellPrice: "",
        lines: [{ itemId: plan.itemId, qty: 1 }],
        orderPack: order.pack,
        awaiting: true,
      }, STOCK_AUTO_CUT_ACTOR);
      summary.cut += 1;
      // The next order of the same pack sees one unit fewer.
      const item = byId.get(plan.accountId).items.find((entry) => entry.id === plan.itemId);
      item.left -= 1;
    } catch (error) {
      // A queue cut meanwhile (409) or a pack that ran out is not an outage.
      if (error.status && error.status < 500) summary.skipped += 1;
      else {
        summary.failed += 1;
        console.error(`[stock-auto-cut] order ${order.ref}`, error);
      }
    }
  }
  if (summary.cut || summary.failed) console.info(`[stock-auto-cut] cut ${summary.cut}, failed ${summary.failed}`);
  return summary;
}

export function startStockAutoCutScheduler() {
  if (process.env.STOCK_AUTO_CUT === "false") return null;
  if (globalThis[SCHEDULER_KEY]) return globalThis[SCHEDULER_KEY];
  const state = { timer: null, running: false };
  globalThis[SCHEDULER_KEY] = state;
  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      await runStockAutoCut();
    } finally {
      state.running = false;
    }
  };
  state.timer = setInterval(tick, STOCK_AUTO_CUT_EVERY_MS);
  state.timer.unref?.();
  return state;
}
