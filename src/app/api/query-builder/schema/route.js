import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { inspectDatabaseSchema } from "@/server/gamedb-schema-inspector";

export async function GET(request) {
  try {
    await requireSuperAdmin(request);
    const rawConnectionId = new URL(request.url).searchParams.get("connectionId");
    const connectionId = rawConnectionId ? Number(rawConnectionId) : null;
    if (rawConnectionId && (!Number.isInteger(connectionId) || connectionId <= 0)) {
      return jsonError("ฐานข้อมูลที่เลือกไม่ถูกต้อง", 400);
    }
    const connection = connectionId
      ? await findConnectionWithSecret(connectionId)
      : null;
    if (connectionId && !connection) return jsonError("ไม่พบฐานข้อมูลที่เลือก", 404);

    return jsonOk(await inspectDatabaseSchema(connection));
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดตารางและคอลัมน์ได้");
  }
}
