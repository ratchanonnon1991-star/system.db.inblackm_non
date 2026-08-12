import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { restoreRow } from "@/server/gamedb-row-writer";
import { recordEdit } from "@/server/gamedb-edit-log";
import { invalidateQuery } from "@/server/gamedb-result-cache";
import { requestMeta } from "@/lib/request-meta";
import { loadTarget } from "../route";

// Undoes a row delete recorded in the edit log, using the full column
// snapshot that was captured at delete time. Same write gate as adding a
// row (loadTarget -> requireDataWriter), since this is an insert either way.
export async function POST(request, { params }) {
  try {
    const target = await loadTarget(request, params);
    if (target.error) return target.error;
    const { admin, query, layout, connection } = target;

    const body = await request.json();
    if (!body.values || typeof body.values !== "object" || Array.isArray(body.values)) {
      return jsonError("ไม่มีข้อมูลที่จะกู้คืน", 400);
    }

    const { pkValue } = await restoreRow({
      editable: layout.editable,
      connection,
      values: body.values,
    });

    invalidateQuery(query.id);
    await recordEdit({
      queryId: query.id,
      actor: admin.username || admin.displayName || "",
      table: layout.editable.table,
      pkColumn: layout.editable.pk,
      pkValue,
      column: "(กู้คืนแถวที่ลบ)",
      oldValue: null,
      newValue: JSON.stringify(body.values).slice(0, 2000),
      ...requestMeta(request),
    });

    return jsonOk({ pkValue });
  } catch (err) {
    return handleApiError(err, "กู้คืนแถวไม่สำเร็จ");
  }
}
