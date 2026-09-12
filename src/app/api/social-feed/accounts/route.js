import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { removeCollectorAccount } from "@/server/social-feed-repository";

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    await removeCollectorAccount(request.nextUrl.searchParams.get("id"));
    return jsonOk({ ok: true });
  } catch (error) { return handleApiError(error, "ลบบัญชี Login ไม่สำเร็จ"); }
}
