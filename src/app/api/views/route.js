import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireSuperAdmin } from "@/server/auth";
import { insertView, listViewsFor } from "@/server/gamedb-views-repository";

// Any signed-in user can list the templates shared with them; only admins
// create them.
export async function GET(request) {
  try {
    const user = await requireAdmin(request);
    const views = await listViewsFor(user);
    return jsonOk({ views });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดเทมเพลตหน้าจอได้");
  }
}

export async function POST(request) {
  try {
    const admin = await requireSuperAdmin(request);
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return jsonError("กรุณาตั้งชื่อเทมเพลต", 400);

    const view = await insertView({
      name: name.slice(0, 255),
      description: String(body.description || "").trim().slice(0, 500),
      config: body.config,
      isPublic: body.isPublic,
      isDefault: body.isDefault,
      isReadOnly: body.isReadOnly,
      ownerOnly: body.ownerOnly,
      sharedWith: body.sharedWith,
      createdBy: admin.username || "",
    });
    return jsonOk({ view }, 201);
  } catch (err) {
    return handleApiError(err, "ไม่สามารถสร้างเทมเพลตได้");
  }
}
