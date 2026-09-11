import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { setSocialPostSaved, setSocialPostTags } from "@/server/social-feed-repository";

export async function PATCH(request, { params }) {
  try {
    const user = await requireAdmin(request);
    const { id } = await params;
    const body = await request.json();
    if (body.saved !== undefined) await setSocialPostSaved(id, user.id, Boolean(body.saved));
    if (body.tags !== undefined) await setSocialPostTags(id, body.tags);
    return jsonOk({ ok: true });
  } catch (error) { return handleApiError(error, "อัปเดตโพสต์ไม่สำเร็จ"); }
}
