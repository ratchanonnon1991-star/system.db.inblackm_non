export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { startGameinfoRateScheduler } = await import("@/server/gameinfo-rate-scheduler");
  startGameinfoRateScheduler();
}
