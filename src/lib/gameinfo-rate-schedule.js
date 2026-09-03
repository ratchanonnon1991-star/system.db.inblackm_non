export const GAMEINFO_RATE_CACHE_MS = {
  "USDT/THB": 60 * 60 * 1000,
  USDCNY: 12 * 60 * 60 * 1000,
  IDRTHB: 12 * 60 * 60 * 1000,
  USDIDR: 12 * 60 * 60 * 1000,
  THBUSD: 12 * 60 * 60 * 1000,
};

export function nextCoinGeckoRefreshAt(now = new Date()) {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

export function nextFrankfurterRefreshAt(now = new Date()) {
  const current = now.getTime();
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    for (const hour of [4, 16]) {
      const candidate = new Date(now);
      candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
      candidate.setUTCHours(hour, 5, 0, 0);
      if (candidate.getTime() > current) return candidate;
    }
  }
  throw new Error("คำนวณเวลารีเฟรช Frankfurter ไม่สำเร็จ");
}
