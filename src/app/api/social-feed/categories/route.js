import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { createSocialCategory } from "@/server/social-feed-repository";

export async function POST(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    return jsonOk({ category: await createSocialCategory(body.name) }, 201);
  } catch (error) { return handleApiError(error, "เพิ่มหมวดหมู่ไม่สำเร็จ"); }
}
