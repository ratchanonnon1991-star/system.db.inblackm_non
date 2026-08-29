import { GAMEINFO_MARKETS, nextGameinfoMarketRunAt } from "@/lib/gameinfo-market-system";
import { recoverGameinfoMarketChecks, startGameinfoMarketCheck } from "@/server/gameinfo-market-system";

const SCHEDULER_KEY = Symbol.for("gameinfo.marketScheduler");

export function startGameinfoMarketScheduler() {
  if (globalThis[SCHEDULER_KEY]) return globalThis[SCHEDULER_KEY];
  const state = { timer: null, nextRunAt: null };
  globalThis[SCHEDULER_KEY] = state;

  const schedule = () => {
    const now = new Date();
    const next = nextGameinfoMarketRunAt(now);
    state.nextRunAt = next.toISOString();
    state.timer = setTimeout(async () => {
      for (const market of GAMEINFO_MARKETS) {
        try {
          await startGameinfoMarketCheck(market.key, null, "scheduled");
        } catch (error) {
          console.error(`[gameinfo-market] scheduled ${market.key} failed`, error);
        }
      }
      schedule();
    }, Math.max(1000, next.getTime() - now.getTime()));
    state.timer.unref?.();
  };

  recoverGameinfoMarketChecks().catch((error) => console.error("[gameinfo-market] recovery failed", error));
  schedule();
  return state;
}
