import { pagedSnapshots } from "@/server/paged-snapshots";
import { tablePage } from "@/lib/table-pagination";
import { canViewUsdInventory, inventoryError } from "@/lib/usdcodashop-inventory";

export async function readInventoryPage(request, actor, provider, loadAll) {
  if (!canViewUsdInventory(actor)) throw inventoryError("ไม่มีสิทธิ์ดู Inventory", 403);
  const params = new URL(request.url).searchParams;
  const context = [...params].filter(([key]) => !["page", "pageSize", "snapshot", "fresh", "format"].includes(key)).sort(([a], [b]) => a.localeCompare(b));
  const snapshot = await pagedSnapshots.resolve({ actor, scope: JSON.stringify(["inventory", provider, context]),
    snapshot: params.get("snapshot"), fresh: params.get("fresh") === "1", load: loadAll });
  const report = snapshot.value;
  if (!Array.isArray(report?.entries)) throw new Error("Incomplete inventory report");
  const pagination = tablePage(report.entries.length, params.get("page"), params.get("pageSize"));
  return { ...report, page: pagination.page, pageSize: pagination.pageSize, entries: report.entries.slice(pagination.start, pagination.end),
    pagination: { ...pagination, snapshot: snapshot.snapshot, observedAt: snapshot.observedAt } };
}
