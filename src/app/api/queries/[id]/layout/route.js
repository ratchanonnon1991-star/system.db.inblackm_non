import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findQueryById, updateQuery } from "@/server/gamedb-repository";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer";

// This is the layout EVERY user sees, so only admins may change it. Personal
// layouts go to /api/queries/[id]/my-layout instead.
export async function PUT(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const existing = await findQueryById(id);
    if (!existing) return jsonError("ไม่พบ Query นี้", 404);

    const body = await request.json();
    const query = await updateQuery(id, { layout: sanitizeLayout(body.layout) });
    return jsonOk({ layout: query.layout });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถบันทึก Layout ได้");
  }
}
