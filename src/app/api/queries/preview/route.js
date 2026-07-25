import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { runReadOnlyQuery } from "@/server/gamedb-query-runner";

// Test-run raw SQL before saving it as a query. Super admin only because the
// SQL comes straight from the request body.
export async function POST(request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const connection = body.connectionId
      ? await findConnectionWithSecret(body.connectionId)
      : null;
    if (body.connectionId && !connection) {
      return jsonError("ไม่พบฐานข้อมูลที่เลือก", 404);
    }
    const result = await runReadOnlyQuery(body.sqlText, connection);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, "ไม่สามารถรัน SQL ได้");
  }
}
