import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin, requireSuperAdmin } from "@/server/auth";
import { listConnectionFlags, saveConnectionFlags } from "@/server/gamedb-side-tables";

// Which databases may be written to, and their per-connection limits.
// Everyone may read them (the UI greys out editing when a database is
// read-only); only admins may change them.
export async function GET(request) {
  try {
    await requireAdmin(request);
    const flags = await listConnectionFlags();
    return jsonOk({ flags });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดการตั้งค่าฐานข้อมูลได้");
  }
}

export async function PUT(request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const flags = await saveConnectionFlags(body.connectionId ?? null, {
      allowWrite: body.allowWrite,
      statementTimeoutMs: body.statementTimeoutMs,
      maxRows: body.maxRows,
    });
    return jsonOk({ flags });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถบันทึกการตั้งค่าฐานข้อมูลได้");
  }
}
