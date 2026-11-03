import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { cardDetail } from "@/server/profit-aggregate";
import { getCategory } from "@/server/profit-categories";
import { tablePage } from "@/lib/table-pagination";
import { pagedSnapshots } from "@/server/paged-snapshots";

export async function GET(request, { params }) {
  try {
    const actor = await requireProfitAccess(request);
    const { categoryId, cardId } = await params;
    const category = getCategory(categoryId);
    if (!category) return jsonError("ไม่พบหมวดหมู่นี้", 404);
    const query = new URL(request.url).searchParams;
    if (query.has("page")) {
      const read = await pagedSnapshots.resolve({ actor, scope: JSON.stringify(["profit-card", category.id, cardId]), snapshot: query.get("snapshot"), fresh: query.get("fresh") === "1", load: () => cardDetail(category.id, cardId) });
      const card = read.value;
      if (!card) return jsonError("ไม่พบบัตรนี้", 404);
      const search = card.source === "gocash" ? String(query.get("search") || "").trim().toLowerCase() : "";
      const orders = card.orders.filter((order) => !search || [order.txid, order.orderId, order.saleOrderId, order.packName].filter((value) => value != null && value !== "").join(" ").toLowerCase().includes(search));
      const pagination = tablePage(orders.length, query.get("page"), query.get("pageSize"));
      const response = jsonOk({ category, card: { ...card, orderTotal: orders.length, orders: orders.slice(pagination.start, pagination.end) }, pagination: { ...pagination, snapshot: read.snapshot, observedAt: read.observedAt } });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const card = await cardDetail(category.id, cardId);
    if (!card) return jsonError("ไม่พบบัตรนี้", 404);
    return jsonOk({ category, card });
  } catch (err) {
    return handleApiError(err, "โหลดรายละเอียดบัตรไม่สำเร็จ");
  }
}
