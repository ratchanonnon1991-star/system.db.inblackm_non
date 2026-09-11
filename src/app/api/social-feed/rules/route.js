import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { deleteSocialRule, saveSocialRule } from "@/server/social-feed-repository";

export async function POST(request) {
  try {
    await requireAdmin(request);
    return jsonOk({ rule: await saveSocialRule(await request.json()) }, 201);
  } catch (error) { return handleApiError(error, "บันทึก rule ไม่สำเร็จ"); }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    await deleteSocialRule(request.nextUrl.searchParams.get("id"));
    return jsonOk({ ok: true });
  } catch (error) { return handleApiError(error, "ลบ rule ไม่สำเร็จ"); }
}
