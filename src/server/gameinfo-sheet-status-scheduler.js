import { nextGameinfoSheetSyncAt } from "@/lib/gameinfo-sheet-packs";
import { syncGameinfoSheetPackStatus } from "@/server/gameinfo-sheet-import";

const SCHEDULER_KEY = Symbol.for("gameinfo.sheetStatusScheduler");

export function startGameinfoSheetStatusScheduler() {
  if (globalThis[SCHEDULER_KEY]) return globalThis[SCHEDULER_KEY];
  const state = { timer: null, nextRunAt: null };
  globalThis[SCHEDULER_KEY] = state;

  const schedule = () => {
    const now = new Date();
    const next = nextGameinfoSheetSyncAt(now);
    state.nextRunAt = next.toISOString();
    state.timer = setTimeout(async () => {
      try {
        const { results, summary } = await syncGameinfoSheetPackStatus();
        console.info(`[gameinfo-sheet-status] ${summary.packs} packs changed in ${summary.games} games, ${summary.failed} failed`);
        for (const item of results.filter((result) => result.error)) {
          console.error(`[gameinfo-sheet-status] game ${item.gameId}: ${item.error}`);
        }
      } catch (error) {
        console.error("[gameinfo-sheet-status] scheduled run failed", error);
      } finally {
        schedule();
      }
    }, Math.max(1000, next.getTime() - now.getTime()));
    state.timer.unref?.();
  };

  schedule();
  return state;
}
