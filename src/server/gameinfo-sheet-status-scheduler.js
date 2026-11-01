import { nextGameinfoSheetSyncAt } from "@/lib/gameinfo-sheet-packs";
import { syncGameinfoSheetPackStatus } from "@/server/gameinfo-sheet-import";
import { recordGameinfoSheetSyncRun } from "@/server/gameinfo-sheet-sync-runs";

const SCHEDULER_KEY = Symbol.for("gameinfo.sheetStatusScheduler");

/** One daily run, kept for the sheet-import page whether it worked or not. */
export async function runGameinfoSheetSync({ sync = syncGameinfoSheetPackStatus, record = recordGameinfoSheetSyncRun } = {}) {
  let run;
  try {
    run = await sync();
    console.info(`[gameinfo-sheet-status] ${run.summary.packs} packs changed in ${run.summary.games} games, ${run.summary.failed} failed`);
    for (const item of run.results.filter((result) => result.error)) {
      console.error(`[gameinfo-sheet-status] game ${item.gameId}: ${item.error}`);
    }
  } catch (error) {
    console.error("[gameinfo-sheet-status] scheduled run failed", error);
    run = { error: error instanceof Error ? error.message : String(error) };
  }
  try {
    await record(run);
  } catch (error) {
    console.error("[gameinfo-sheet-status] could not keep the run's result", error);
  }
}

export function startGameinfoSheetStatusScheduler() {
  if (globalThis[SCHEDULER_KEY]) return globalThis[SCHEDULER_KEY];
  const state = { timer: null, nextRunAt: null };
  globalThis[SCHEDULER_KEY] = state;

  const schedule = () => {
    const now = new Date();
    const next = nextGameinfoSheetSyncAt(now);
    state.nextRunAt = next.toISOString();
    state.timer = setTimeout(async () => {
      await runGameinfoSheetSync();
      schedule();
    }, Math.max(1000, next.getTime() - now.getTime()));
    state.timer.unref?.();
  };

  schedule();
  return state;
}
