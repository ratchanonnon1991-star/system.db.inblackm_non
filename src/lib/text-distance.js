// Edit-distance helpers for "did you mean this?" nudges. Small and dependency
// free — the candidate pools here are a few hundred game or country names, not
// a search index. Lives in lib/ because both the client fields and the
// server-side CSV import preview need the same answer: the preview has to warn
// about a near-miss game name before it creates a duplicate game.

// Iterative Levenshtein over a single DP row.
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

// The name key used when comparing game names for duplicates: case- and
// surrounding-whitespace-insensitive, nothing more. Deliberately *not* the
// aggressive country key (which strips punctuation) — two game names that
// differ only by a colon are genuinely different games.
export function gameNameKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

// A typo is a *small* edit distance relative to what was typed: up to 30% of
// the length, but always at least 1 so short names still get a nudge. Exact
// matches are excluded — those are duplicates, a different (blocking) case.
export function similarNameDistanceLimit(query) {
  return Math.max(1, Math.round(query.length * 0.3));
}

// Names from `pool` that look like a typo of `value`, closest first. Returns
// [] for an exact match or a query too short to be meaningful.
export function suggestSimilarNames(value, pool, limit = 5) {
  const q = gameNameKey(value);
  if (q.length < 2) return [];
  const maxDistance = similarNameDistanceLimit(q);
  return (pool || [])
    .map((name) => ({ name, dist: levenshtein(q, gameNameKey(name)) }))
    .filter(({ dist }) => dist > 0 && dist <= maxDistance)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map((item) => item.name);
}
