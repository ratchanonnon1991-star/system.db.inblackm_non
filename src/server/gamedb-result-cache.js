// A few seconds of memory in front of the database.
//
// Panels refresh on a timer and several people often watch the same screen, so
// the same statement can arrive many times per second. Holding each result for
// a moment collapses that into one query without anyone seeing stale numbers:
// the window is shorter than the fastest refresh interval the UI offers, and
// pressing "รันใหม่" skips the cache entirely.
const TTL_MS = 5000;
const MAX_ENTRIES = 200;

const entries = new Map();

function keyOf({ queryId, connectionId, params, offset, limit }) {
  return JSON.stringify([queryId, connectionId ?? 0, params || {}, offset || 0, limit || 0]);
}

function prune(now) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  // Oldest first — Map preserves insertion order.
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    entries.delete(oldest);
  }
}

export function getCachedResult(descriptor) {
  const now = Date.now();
  const entry = entries.get(keyOf(descriptor));
  if (!entry || entry.expiresAt <= now) return null;
  return entry.value;
}

export function setCachedResult(descriptor, value) {
  const now = Date.now();
  prune(now);
  entries.set(keyOf(descriptor), { value, expiresAt: now + TTL_MS });
  return value;
}

/** Called after a write so the next read cannot serve the pre-edit rows. */
export function invalidateQuery(queryId) {
  for (const key of entries.keys()) {
    if (key.startsWith(`[${JSON.stringify(queryId)},`)) entries.delete(key);
  }
}

export function cacheStats() {
  return { entries: entries.size, ttlMs: TTL_MS };
}
