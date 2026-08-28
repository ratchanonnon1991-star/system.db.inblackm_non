export const GAMEINFO_HISTORY_KEY = "gameinfo-navigation-history-v1";
export const GAMEINFO_HISTORY_LIMIT = 30;

export function normalizeGameinfoHistoryStack(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((href) => typeof href === "string" && href.startsWith("/gameinfo/"))
    .slice(-GAMEINFO_HISTORY_LIMIT);
}

export function updateGameinfoHistoryStack(stack, currentHref) {
  const current = typeof currentHref === "string" && currentHref.startsWith("/gameinfo/")
    ? currentHref
    : "";
  const next = normalizeGameinfoHistoryStack(stack);
  if (!current || next.at(-1) === current) return next;
  if (next.at(-2) === current) {
    next.pop();
    return next;
  }
  return [...next, current].slice(-GAMEINFO_HISTORY_LIMIT);
}

export function getGameinfoReturnHref(stack, fallbackHref) {
  return normalizeGameinfoHistoryStack(stack).at(-2) || fallbackHref;
}
