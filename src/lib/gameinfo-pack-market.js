export function packCompareStorageKey(name, provider, game) {
  return `gameinfo:${provider}-${name}:${game || "zepeto"}`;
}

export function togglePackCompareColumn(columns, column) {
  return columns.includes(column) ? columns.filter((item) => item !== column) : [...columns, column];
}

// itemku lists every shop on the marketplace, so the table caps how many seller
// columns it opens with. Sellers covering the most pack groups are kept, plus
// the reference seller, and the rest come back from the column menu.
export function cappedSellerColumns(sellers, coverage, limit, baselineSeller) {
  if (sellers.length <= limit) return [];
  const ranked = [...sellers].sort((a, b) => (coverage.get(b) || 0) - (coverage.get(a) || 0));
  const kept = new Set([baselineSeller, ...ranked.slice(0, limit)].filter(Boolean));
  return sellers.filter((seller) => !kept.has(seller)).map((seller) => `seller:${seller}`);
}

// The price refresh runs once a day at 09:00 Thailand time. ICT has no DST and
// no offset history to worry about, so 02:00 UTC pins it for every viewer
// regardless of the timezone their browser is in.
export const DAILY_REFRESH_UTC_HOUR = 2;

export function msUntilNextDailyRefresh(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(DAILY_REFRESH_UTC_HOUR, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now;
}
