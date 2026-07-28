import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findQueryById } from "@/server/gamedb-repository";
import { normalizeLayout } from "@/lib/gamedb-layout";
import { recordEdit } from "@/server/gamedb-edit-log";
import { runRowAction } from "@/server/gamedb-row-actions";

// Fires one of the query's configured row actions. Admin-only, and the action
// itself must come from the saved config — the browser sends an index, not a URL.
export async function POST(request, { params }) {
  try {
    const admin = await requireSuperAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const layout = normalizeLayout(query.layout);
    const body = await request.json();
    const action = layout.actions?.[Number(body.actionIndex)];
    if (!action) return jsonError("ไม่พบ action นี้ใน Query", 404);

    const values = body.values && typeof body.values === "object" ? body.values : {};
    const result = await runRowAction(action, values);

    // Reuse the edit log: this is another "someone changed something" event.
    await recordEdit({
      queryId: query.id,
      actor: admin.username || "",
      table: "(action)",
      pkColumn: "action",
      pkValue: action.label,
      column: action.method || "POST",
      oldValue: JSON.stringify(values).slice(0, 500),
      newValue: `${result.status} ${result.ok ? "OK" : "FAILED"}`,
    });

    return jsonOk({ result });
  } catch (err) {
    return handleApiError(err, "เรียก action ไม่สำเร็จ");
  }
}
