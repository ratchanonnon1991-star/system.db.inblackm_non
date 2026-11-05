// A game's App Store icon, for a stock card whose game has no logo in GameInfo
// or on the TopUp website. The stock IDs are iOS accounts, so the App Store
// app of the same name is the game. Pure: the server lookup and the tests share it.

const plain = (value) => String(value ?? "").replace(/[™®©℠]/g, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const flat = (value) => plain(value).replace(/[^a-z0-9ก-๙]+/g, "");
const words = (value) => plain(value).split(/[^a-z0-9ก-๙]+/).filter(Boolean);

/** The cache key of a game name: "Honkai: Star Rail" and "honkai star rail" are one game. */
export const appStoreKey = flat;

/** Apple's public search for iOS apps named `term`. */
export function appStoreSearchUrl(term, country = "us") {
  const params = new URLSearchParams({ term: String(term || "").trim(), entity: "software", country, limit: "10" });
  return `https://itunes.apple.com/search?${params}`;
}

/**
 * The search results → { appId, appName, artworkUrl } of the most-rated game
 * whose name has every word of the term ("FC Mobile" → "EA SPORTS FC™ Football
 * Mobile", not a fan database with a dozen ratings), else null. Only apps filed
 * under Games count, so an app that merely shares the name is never picked.
 */
export function pickAppStoreIcon(term, results) {
  const want = words(term);
  if (flat(term).length < 3) return null;
  let best = null;
  for (const app of Array.isArray(results) ? results : []) {
    if (!/^games$/i.test(String(app.primaryGenreName || ""))) continue;
    const have = new Set(words(app.trackName));
    if (!want.every((word) => have.has(word)) && !flat(app.trackName).includes(flat(term))) continue;
    const artwork = String(app.artworkUrl512 || app.artworkUrl100 || "");
    if (!/^https:\/\//i.test(artwork)) continue;
    const ratings = Number(app.userRatingCount) || 0;
    if (!best || ratings > best.ratings) best = { ratings, appId: String(app.trackId || ""), appName: String(app.trackName || ""), artworkUrl: artwork };
  }
  if (!best) return null;
  const { ratings, ...icon } = best;
  return icon;
}
