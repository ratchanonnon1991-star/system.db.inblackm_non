export async function register() {
  // Both flags are inlined at build time, so the edge compilation of this file
  // drops the import entirely — without that, webpack follows it into pg and
  // fails to resolve node:fs.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { startGameinfoRateScheduler } = await import("@/server/gameinfo-rate-scheduler");
    startGameinfoRateScheduler();
  }
}
