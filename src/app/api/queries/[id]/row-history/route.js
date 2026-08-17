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
 * admin-only log page).
 *
 * The table always comes from the query's saved editable config, never from
 * the request. `rowSource` only picks between the branches that config
 * already names, so a stacked query shows each row the history of the table
 * it actually came from -- and a value naming no branch gets nothing rather
 * than another table's history.
 */
export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const layout = normalizeLayout(query.layout);
    if (!layout.editable) return jsonOk({ entries: [] });

    const url = new URL(request.url);
    const pkValue = url.searchParams.get("pkValue");
    if (pkValue === null || pkValue === "") {
      return jsonError("ไม่มีแถวที่จะดูประวัติ", 400);
    }

    const rows = layout.editable.rowTargets;
    let table = layout.editable.table;
    if (rows) {
      const source = url.searchParams.get("rowSource");
      const branch = rows.branches.find((entry) => entry.table === source);
      if (!branch) return jsonOk({ entries: [], pkColumn: rows.keyColumn });
      table = branch.table;
    }

    const entries = await listEditsForRow({ table, pkValue });
    return jsonOk({ entries, pkColumn: layout.editable.pk });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติของแถวนี้ไม่สำเร็จ");
  }
}
