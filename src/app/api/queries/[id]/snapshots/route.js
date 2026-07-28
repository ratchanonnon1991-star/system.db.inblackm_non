import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin, requireSuperAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { runReadOnlyQuery } from "@/server/gamedb-query-runner";
import {
  deleteSnapshotsForQuery,
  insertSnapshot,
  listSnapshots,
} from "@/server/gamedb-snapshots-repository";

export async function GET(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const snapshots = await listSnapshots(Number(id));
    return jsonOk({ snapshots });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดรายการ snapshot ได้");
  }
}

// The server re-runs the query rather than storing whatever the browser had on
// screen, so a snapshot is always a real result of that SQL at that moment.
export async function POST(request, { params }) {
  try {
    const user = await requireAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const body = await request.json().catch(() => ({}));
    const values = body?.params && typeof body.params === "object" ? body.params : {};

    const connection = query.connectionId
      ? await findConnectionWithSecret(query.connectionId)
      : null;
    if (query.connectionId && !connection) {
      return jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว", 409);
    }

    const result = await runReadOnlyQuery(query.sqlText, connection, values);
    const snapshot = await insertSnapshot({
      queryId: query.id,
      name:
        String(body?.name || "").trim() ||
        `${query.name} — ${new Date().toLocaleString("th-TH")}`,
      params: values,
      result,
      createdBy: user.username || "",
    });
    return jsonOk({ snapshot }, 201);
  } catch (err) {
    return handleApiError(err, "บันทึก snapshot ไม่สำเร็จ");
  }
}

// Clears every snapshot of this query at once.
export async function DELETE(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const deleted = await deleteSnapshotsForQuery(Number(id));
    return jsonOk({ deleted });
  } catch (err) {
    return handleApiError(err, "ลบ snapshot ไม่สำเร็จ");
  }
}
