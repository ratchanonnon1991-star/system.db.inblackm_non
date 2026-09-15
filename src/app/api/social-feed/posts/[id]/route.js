import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { setPostFolders } from "@/server/social-feed-repository";

export async function PATCH(request, { params }) {
  try {
    const user = await requireAdmin(request);
    const { id } = await params;
    const body = await request.json();
    if (body.folders !== undefined) await setPostFolders(id, user.id, body.folders);
    return jsonOk({ ok: true });
  } catch (error) { return handleApiError(error, "อัปเดตโพสต์ไม่สำเร็จ"); }
}
