import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { listUserLayouts } from "@/server/gamedb-side-tables";

/** Every personal layout of the signed-in user, keyed by query id. */
export async function GET(request) {
  try {
    const user = await requireAdmin(request);
    const layouts = await listUserLayouts(user.id);
    return jsonOk({ layouts });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลด layout ส่วนตัวได้");
  }
}
