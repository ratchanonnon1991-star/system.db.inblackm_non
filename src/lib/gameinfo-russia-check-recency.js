export const RUSSIA_CHECK_RECENT_MS = 24 * 60 * 60 * 1000;

export function russiaCheckRecentBounds(now = new Date()) {
  const time = new Date(now).getTime();
  if (!Number.isFinite(time)) throw new Error("Invalid recent log date");
  return { startAt: new Date(time - RUSSIA_CHECK_RECENT_MS).toISOString(), endAt: new Date(time).toISOString() };
}

export function russiaCheckDisplayStatus(item, now) {
  if (item.status === "removed") return "removed";
  const activated = item.activatedAt || item.firstSeenAt;
  const age = new Date(now).getTime() - new Date(activated).getTime();
  return activated && age >= 0 && age < RUSSIA_CHECK_RECENT_MS ? "added" : "unchanged";
}
