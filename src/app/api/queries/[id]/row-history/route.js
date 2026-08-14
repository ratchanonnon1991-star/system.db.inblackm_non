import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findQueryById } from "@/server/gamedb-repository";
import { listEditsForRow } from "@/server/gamedb-edit-log";
import { normalizeLayout } from "@/lib/gamedb-layout";

/**
 * Who changed this one row, and what it was before.
 *
 * Open to anyone signed in who can already run the query and see the row's
 * current values -- knowing who last touched it is the whole point, and the
 * response deliberately carries no ip/user_agent (that stays on the
 * admin-only log page). The table is taken from the query's saved editable
 * config, never from the request, so this cannot be pointed at another table.
 */
export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const layout = normalizeLayout(query.layout);
    if (!layout.editable) return jsonOk({ entries: [] });

    const pkValue = new URL(request.url).searchParams.get("pkValue");
    if (pkValue === null || pkValue === "") {
      return jsonError("ไม่มีแถวที่จะดูประวัติ", 400);
    }

    const entries = await listEditsForRow({ table: layout.editable.table, pkValue });
    return jsonOk({ entries, pkColumn: layout.editable.pk });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติของแถวนี้ไม่สำเร็จ");
  }
}
