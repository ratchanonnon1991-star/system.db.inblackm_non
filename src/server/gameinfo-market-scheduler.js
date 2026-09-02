import { GAMEINFO_MARKETS, nextGameinfoMarketRunAt } from "@/lib/gameinfo-market-system";
import { refreshGameinfoPricePages } from "@/server/gameinfo-market-providers";
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
      // The compare page snapshots go first: they are what the page renders, and
      // the market checks below re-scrape the same games for the mapping side.
      try {
        const pages = await refreshGameinfoPricePages();
        console.info(`[gameinfo-price-pages] refreshed ${pages.refreshed}, failed ${pages.failed}`);
      } catch (error) {
        console.error("[gameinfo-price-pages] scheduled refresh failed", error);
      }
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
