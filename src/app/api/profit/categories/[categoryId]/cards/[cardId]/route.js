import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitAccess } from "@/server/auth";
import { cardDetail } from "@/server/profit-aggregate";
import { getCategory } from "@/server/profit-categories";

export async function GET(request, { params }) {
  try {
    await requireProfitAccess(request);
    const { categoryId, cardId } = await params;
    const category = getCategory(categoryId);
    if (!category) return jsonError("ไม่พบหมวดหมู่นี้", 404);
    const card = await cardDetail(category.id, cardId);
    if (!card) return jsonError("ไม่พบบัตรนี้", 404);
    return jsonOk({ category, card });
  } catch (err) {
    return handleApiError(err, "โหลดรายละเอียดบัตรไม่สำเร็จ");
  }
}
