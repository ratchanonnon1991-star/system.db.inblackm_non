import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { createSocialSource, updateSocialSourceAccount } from "@/server/social-feed-repository";

export async function POST(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ source: await createSocialSource(await request.json()) }, 201);
  } catch (error) { return handleApiError(error, "เพิ่มกลุ่ม Facebook ไม่สำเร็จ"); }
}

export async function PATCH(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    await updateSocialSourceAccount(body.id, body.requiresLogin);
    return jsonOk({ ok: true });
  } catch (error) { return handleApiError(error, "กำหนดบัญชี Login ไม่สำเร็จ"); }
}
