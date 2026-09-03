// "What do other games compute in this column?"
//
// A column definition is shared by every game, but a game can compute it
// differently (gameFormula), so the same column ends up with a handful of
// real-world formulas spread across 216 games. Someone filling the column in
// for a new game almost always wants one of those, and up to now the only way
// to reuse a formula was to have remembered to save it as a Formula Memory
// preset first.
//
// Grouping is kept here, away from the queries, so it can be read and tested
// without a database.

/**
 * Raw sightings -> the distinct formulas, most used first.
 *
 * An entry is `{ formula, gameName }`, or `{ formula, shared: true }` for the
 * column's own formula — the one every game computes unless it says otherwise.
 * A game is counted once per formula however many places it was seen in.
 */
export function groupGameinfoColumnFormulas(entries, { limit = 8, gameLimit = 6 } = {}) {
  const byFormula = new Map();
  for (const entry of entries || []) {
    const formula = String(entry?.formula ?? "").trim();
    if (!formula) continue;
    const bucket = byFormula.get(formula) || { formula, shared: false, games: [] };
    if (entry.shared) bucket.shared = true;
    else {
      const gameName = String(entry.gameName ?? "").trim();
      if (gameName && !bucket.games.includes(gameName)) bucket.games.push(gameName);
    }
    byFormula.set(formula, bucket);
  }
  return [...byFormula.values()]
    .sort((a, b) => {
      // The shared formula is what the column means today, so it leads.
      if (a.shared !== b.shared) return a.shared ? -1 : 1;
      if (a.games.length !== b.games.length) return b.games.length - a.games.length;
      return a.formula.localeCompare(b.formula, "th");
    })
    .slice(0, limit)
    .map((bucket) => ({
      formula: bucket.formula,
      shared: bucket.shared,
      gameCount: bucket.games.length,
      // Enough names to recognise the formula, not the whole list of 216.
      games: bucket.games.slice(0, gameLimit),
      moreGames: Math.max(0, bucket.games.length - gameLimit),
    }));
}
