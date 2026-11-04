import { apiJson } from "@/lib/api-json";

export const INVENTORY_READ_TIMEOUT = 60_000;
export const INVENTORY_POLL_INTERVAL = 30_000;
export const inventoryPollDelay = (failures) => Math.min(120_000, INVENTORY_POLL_INTERVAL * 2 ** Math.min(failures, 2));

export function inventoryPageUrl(endpoint, viewKey, snapshot, reuseSnapshot) {
  const params = new URLSearchParams(viewKey);
  if (!params.has("pageSize")) params.set("pageSize", "25");
  if (reuseSnapshot && snapshot) params.set("snapshot", snapshot);
  else params.set("fresh", "1");
  return `${endpoint}?${params}`;
}

// Coalesce the same read, cancel a superseded view, and bound fetch + body parsing.
// This never retries or cancels business writes and never caches wallet data.
export function createInventoryReadSession({ request = apiJson, timeoutMs = INVENTORY_READ_TIMEOUT,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let current = null;
  const cancel = () => { if (current) { current.controller.abort(); current = null; } };
  return {
    cancel,
    run(key, url) {
      if (current?.key === key) return current.promise;
      cancel();
      const entry = { key, controller: new AbortController(), timedOut: false };
      const timer = setTimer(() => { entry.timedOut = true; entry.controller.abort(); }, timeoutMs);
      current = entry;
      entry.promise = Promise.resolve().then(() => request(url, { cache: "no-store", signal: entry.controller.signal }))
        .catch((error) => {
          if (entry.timedOut) throw Object.assign(new Error("โหลดข้อมูลนานเกินกำหนด กรุณาลดช่วงวันที่หรือลองโหลดใหม่"), { name: "TimeoutError" });
          throw error;
        }).finally(() => { clearTimer(timer); if (current === entry) current = null; });
      return entry.promise;
    },
  };
}
