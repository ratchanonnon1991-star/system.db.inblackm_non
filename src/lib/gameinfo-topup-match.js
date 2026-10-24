// Name matching between GameInfo and the TopUp website, which name the same
// game and the same pack a little differently ("HONKAI IMPACT" + region ASIA
// vs "Honkai Impact 3 (ASIA)"; "6,600 B-Chips × 2" vs "6600 B-Chips X 2").
// Only ever a suggestion for games — an editor confirms the link — but packs
// are matched by it outright, so it stays strict: same words, same numbers.

function words(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .replace(/(\d),(?=\d{3})/g, "$1")
    .replace(/[×✕]/g, " x ")
    .split(/[^a-z0-9ก-๙]+/)
    .filter(Boolean);
}

/** Website games ordered by how well their name fits this GameInfo game; best first, misses dropped. */
export function rankTopupWebGames(gameName, region, games, limit = 8) {
  const target = new Set(words(gameName));
  const regionWords = new Set(words(region));
  if (!target.size) return [];
  return (games || [])
    .map((game) => {
      const own = words(game.name);
      const ownSet = new Set(own);
      const shared = [...target].filter((word) => ownSet.has(word)).length;
      if (!shared) return null;
      const regionHit = [...regionWords].some((word) => ownSet.has(word)) ? 1 : 0;
      // Shared words weigh most; the region breaks ties between the many
      // regional copies of one game; extra words cost a little.
      const score = shared / target.size + regionHit * 0.5 - Math.max(0, own.length - shared) * 0.02;
      return { game, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ game }) => game);
}

/** Key two pack names share when they name the same pack. */
export function gameinfoPackMatchKey(name) {
  return words(name).join(" ");
}

/** Website package for each GameInfo pack name, matched by exact word key. */
export function matchTopupWebPackages(packNames, packages) {
  const byKey = new Map();
  for (const pkg of packages || []) {
    for (const candidate of [pkg.label, pkg.amountDisplay]) {
      const key = gameinfoPackMatchKey(candidate);
      if (key && !byKey.has(key)) byKey.set(key, pkg);
    }
  }
  return new Map((packNames || []).map((name) => [name, byKey.get(gameinfoPackMatchKey(name)) || null]));
}
