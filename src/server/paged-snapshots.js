import { randomUUID } from "node:crypto";

function ownerKey(actor) {
  if (actor?.id == null) throw Object.assign(new Error("กรุณาเข้าสู่ระบบ"), { status: 403 });
  return JSON.stringify([String(actor.id), actor.role || "", [...(actor.permissions || [])].sort()]);
}

// An explicitly requested, short-lived read snapshot. Every API still checks
// current grants before lookup. Initial visits/manual refresh always load fresh.
export function createPagedSnapshots({ ttlMs = 120000, maxBytes = 32 * 1024 * 1024, maxEntryBytes = 24 * 1024 * 1024,
  maxEntries = 16, now = Date.now, token = randomUUID } = {}) {
  const entries = new Map(), pending = new Map();
  let retainedBytes = 0;
  const remove = (id) => { const entry = entries.get(id); if (entry) retainedBytes -= entry.bytes; entries.delete(id); };
  function prune() {
    for (const [id, entry] of entries) if (entry.expires <= now()) remove(id);
    while (entries.size > maxEntries || retainedBytes > maxBytes) remove(entries.keys().next().value);
  }
  return {
    async resolve({ actor, scope, snapshot, fresh = false, load }) {
      const owner = ownerKey(actor); const key = JSON.stringify([owner, scope]);
      prune();
      const cached = !fresh && entries.get(snapshot);
      if (cached && cached.owner === owner && cached.scope === scope) {
        entries.delete(snapshot); entries.set(snapshot, cached);
        return { value: cached.value, snapshot, observedAt: cached.observedAt, reused: true };
      }
      const existing = pending.get(key);
      if (!fresh && existing && existing.started + ttlMs > now()) return existing.promise;
      const work = { started: now() };
      work.promise = Promise.resolve().then(load).then((value) => {
        if (value == null) return { value, snapshot: null, observedAt: new Date(now()).toISOString(), reused: false };
        // Preserve the previous JSON wire contract (dates/undefined) and isolate
        // this snapshot from a loader's subsequently mutated objects.
        const json = JSON.stringify(value); const bytes = Buffer.byteLength(json);
        const normalized = JSON.parse(json); const observedAt = new Date(now()).toISOString();
        let id = null;
        if (bytes <= maxEntryBytes && bytes <= maxBytes && maxEntries > 0) {
          id = token(); entries.set(id, { value: normalized, owner, scope, observedAt, expires: now() + ttlMs, bytes }); retainedBytes += bytes; prune();
        }
        return { value: normalized, snapshot: id, observedAt, reused: false };
      }).finally(() => { if (pending.get(key) === work) pending.delete(key); });
      if (pending.size >= maxEntries) pending.delete(pending.keys().next().value);
      pending.set(key, work);
      return work.promise;
    },
  };
}

export const pagedSnapshots = createPagedSnapshots();
