import { handleApiError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { deleteSsoMapping } from "@/server/gamedb-sso-map-repository";

export async function DELETE(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    await deleteSsoMapping(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "เลิกเชื่อมบัญชี hiring ไม่สำเร็จ");
  }
}
