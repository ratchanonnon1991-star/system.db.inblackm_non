import { nextRussiaCheckRunAt } from "@/lib/gameinfo-russia-check";
import { recoverRussiaChecks, startRussiaCheck } from "@/server/gameinfo-russia-check";

const SCHEDULER_KEY = Symbol.for("gameinfo.russiaCheckScheduler");

export function startGameinfoRussiaCheckScheduler() {
  if (globalThis[SCHEDULER_KEY]) return globalThis[SCHEDULER_KEY];
  const state = { timer: null, nextRunAt: null };
  globalThis[SCHEDULER_KEY] = state;

  const schedule = () => {
    const now = new Date();
    const next = nextRussiaCheckRunAt(now);
    state.nextRunAt = next.toISOString();
    state.timer = setTimeout(async () => {
      try {
        await startRussiaCheck(null, "scheduled");
      } catch (error) {
        console.error("[gameinfo-russia-check] scheduled refresh failed", error);
      } finally {
        schedule();
      }
    }, Math.max(1000, next.getTime() - now.getTime()));
    state.timer.unref?.();
  };

  recoverRussiaChecks().catch((error) => console.error("[gameinfo-russia-check] recovery failed", error));
  schedule();
  return state;
}
