// Low-stock alert: every few minutes, tell the Telegram group which packs dropped below their
// "แจ้งเมื่อต่ำกว่า" level. Off unless STOCK_LOW_ALERT=true, since a first run reports every pack
// that is low on the balances as they stand.
import { stockLowAlertPlan, stockLowAlertText } from "@/lib/stock-low-alert";
import { sendStockTelegram, telegramConfigured } from "@/server/inventory-alerts";
import { listStockAccounts, markStockLowAlerts } from "@/server/stock-repository";

const SCHEDULER_KEY = Symbol.for("stock.lowAlertScheduler");
export const STOCK_LOW_ALERT_EVERY_MS = 5 * 60 * 1000;

/** One pass. A failed send marks nothing, so the next pass tries again. Never throws. */
export async function runStockLowAlert({ list = listStockAccounts, send = sendStockTelegram, mark = markStockLowAlerts } = {}) {
  try {
    const { due, cleared } = stockLowAlertPlan(await list());
    if (due.length) await send(stockLowAlertText(due));
    if (due.length || cleared.length) await mark(due.map((pack) => pack.id), cleared);
    return { sent: due.length, cleared: cleared.length, failed: false };
  } catch (error) {
    // The message says which step failed; a Telegram error could carry the bot token in its URL.
    console.error("[stock-low-alert]", error.message === "TELEGRAM_SEND_FAILED" || error.message === "TELEGRAM_NOT_CONFIGURED" ? error.message : error);
    return { sent: 0, cleared: 0, failed: true };
  }
}

export function startStockLowAlertScheduler() {
  if (process.env.STOCK_LOW_ALERT !== "true" || !telegramConfigured()) return null;
  if (globalThis[SCHEDULER_KEY]) return globalThis[SCHEDULER_KEY];
  const state = { timer: null, running: false };
  globalThis[SCHEDULER_KEY] = state;
  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      await runStockLowAlert();
    } finally {
      state.running = false;
    }
  };
  state.timer = setInterval(tick, STOCK_LOW_ALERT_EVERY_MS);
  state.timer.unref?.();
  return state;
}
