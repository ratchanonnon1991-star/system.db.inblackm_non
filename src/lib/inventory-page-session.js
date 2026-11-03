import { createInventoryReadSession, inventoryPageUrl } from "./inventory-read-session.js";

// Reuse only when navigating an already-loaded report's pages. A refresh,
// polling tick, changed filter or post-write reload starts a fresh report.
export function createInventoryPageSession(options) {
  const reader = createInventoryReadSession(options);
  let previous = null, generation = 0;
  return {
    cancel() { generation++; reader.cancel(); },
    async run(endpoint, viewKey) {
      const version = ++generation;
      const params = new URLSearchParams(viewKey);
      const page = params.get("page") || "1", pageSize = params.get("pageSize") || "25";
      const context = JSON.stringify([endpoint, [...params].filter(([key]) => !["page", "pageSize"].includes(key)).sort(([a], [b]) => a.localeCompare(b))]);
      const navigating = previous?.context === context && (previous.page !== page || previous.pageSize !== pageSize);
      const url = inventoryPageUrl(endpoint, viewKey, previous?.snapshot, navigating);
      const result = await reader.run(url, url);
      if (version === generation) previous = { context, page: String(result.page || page), pageSize: String(result.pageSize || pageSize), snapshot: result.pagination?.snapshot };
      return result;
    },
  };
}
