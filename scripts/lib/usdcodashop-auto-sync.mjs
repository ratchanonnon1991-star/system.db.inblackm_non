export const AUTO_SYNC_ACTOR = Object.freeze({
  id: 0, displayName: "USDCodashop Auto Sync", permissions: Object.freeze(["projectm.admin"]),
});
export const SYNC_INTERVAL_MS = 60_000;

export function safeSyncError(error) {
  if (error?.code === "CODA_NOT_CONFIGURED") return "รอยืนยันยอดยกมาในหน้า USDCodashop";
  if (error?.status === 409) return String(error.message).slice(0, 400);
  // Never log arbitrary pg/network errors: they may contain connection credentials.
  return "ซิงก์ไม่สำเร็จ ตรวจ ENV/การเชื่อมต่อฐานข้อมูลและลองใหม่";
}

export function createAutoSyncLoop({ run, report = async () => {}, log = console.log, schedule = setTimeout, cancel = clearTimeout }) {
  let stopped = false; let timer; let running = null;
  const emit = async (state) => report(state);
  async function tick() {
    if (stopped || running) return;
    cancel(timer);
    running = (async () => {
      try {
        await emit({ state: "syncing" });
        if (stopped) return;
        const result = await run();
        await emit({ state: "ok" });
        log(`[coda-auto] ok added=${result.added} checked=${result.checked}`);
      } catch (error) {
        const message = safeSyncError(error);
        await emit({ state: error?.code === "CODA_NOT_CONFIGURED" ? "waiting" : "error", error: message }).catch(() => {});
        log(`[coda-auto] ${message}`);
      }
    })();
    try { await running; }
    finally {
      running = null;
      if (!stopped) timer = schedule(tick, SYNC_INTERVAL_MS);
    }
  }
  return {
    tick,
    async stop() {
      stopped = true; cancel(timer);
      if (running) await running;
      await emit({ state: "stopped" }).catch(() => {});
    },
  };
}
