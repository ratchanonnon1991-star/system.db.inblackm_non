import { getGameinfoExchangeRates } from "@/server/gameinfo-exchange-rates";
import {
  nextCoinGeckoRefreshAt,
  nextFrankfurterRefreshAt,
} from "@/lib/gameinfo-rate-schedule";

const SCHEDULER_KEY = Symbol.for("gameinfo.exchangeRateScheduler");

const JOBS = [
  { pair: "USDT/THB", nextAt: nextCoinGeckoRefreshAt },
  { pair: "USDCNY", nextAt: nextFrankfurterRefreshAt },
  { pair: "IDRTHB", nextAt: nextFrankfurterRefreshAt },
  { pair: "USDIDR", nextAt: nextFrankfurterRefreshAt },
];

export function startGameinfoRateScheduler() {
  if (globalThis[SCHEDULER_KEY]) return globalThis[SCHEDULER_KEY];

  const state = { timers: new Map(), nextRuns: new Map() };
  globalThis[SCHEDULER_KEY] = state;

  for (const job of JOBS) {
    const scheduleNext = () => {
      const now = new Date();
      const nextRun = job.nextAt(now);
      state.nextRuns.set(job.pair, nextRun.toISOString());
      const timer = setTimeout(async () => {
        try {
          await getGameinfoExchangeRates([job.pair], { force: true });
          console.info(`[gameinfo-rates] refreshed ${job.pair} at ${new Date().toISOString()}`);
        } catch (error) {
          console.error(`[gameinfo-rates] failed ${job.pair}:`, error);
        } finally {
          scheduleNext();
        }
      }, Math.max(1000, nextRun.getTime() - now.getTime()));
      timer.unref?.();
      state.timers.set(job.pair, timer);
    };
    scheduleNext();
  }

  return state;
}
