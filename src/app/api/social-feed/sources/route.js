import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { createSocialSource } from "@/server/social-feed-repository";

export async function POST(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ source: await createSocialSource(await request.json()) }, 201);
  } catch (error) { return handleApiError(error, "เพิ่มกลุ่ม Facebook ไม่สำเร็จ"); }
}
