import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { createSocialCategory, deleteSocialCategory } from "@/server/social-feed-repository";

export async function POST(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    return jsonOk({ category: await createSocialCategory(body.name) }, 201);
  } catch (error) { return handleApiError(error, "เพิ่มหมวดหมู่ไม่สำเร็จ"); }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ deleted: await deleteSocialCategory(request.nextUrl.searchParams.get("id")) });
  } catch (error) { return handleApiError(error, "ลบหมวดหมู่ไม่สำเร็จ"); }
}
