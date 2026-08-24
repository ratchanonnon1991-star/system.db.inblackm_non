import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitAccess, requireProfitEditor } from "@/server/auth";
import { cardsForCategory } from "@/server/profit-aggregate";
import { getCategory } from "@/server/profit-categories";
import { createCard } from "@/server/profit-repository";

export async function GET(request, { params }) {
  try {
    await requireProfitAccess(request);
    const { categoryId } = await params;
    const category = getCategory(categoryId);
    if (!category) return jsonError("ไม่พบหมวดหมู่นี้", 404);
    const cards = await cardsForCategory(categoryId);
    return jsonOk({ category, cards });
  } catch (err) {
    return handleApiError(err, "โหลดรายการบัตรไม่สำเร็จ");
  }
}

export async function POST(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { categoryId } = await params;
    const category = getCategory(categoryId);
    if (!category) return jsonError("ไม่พบหมวดหมู่นี้", 404);
    if (category.source !== "manual") {
      return jsonError("หมวดหมู่นี้ข้อมูลมาจาก DB จริง เพิ่มบัตรเองไม่ได้", 400);
    }
    const body = await request.json();
    const card = await createCard({ categoryId: category.id, ...body });
    return jsonOk({ card });
  } catch (err) {
    return handleApiError(err, "เพิ่มบัตรไม่สำเร็จ");
  }
}
