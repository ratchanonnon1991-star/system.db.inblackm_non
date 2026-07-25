import { handleApiError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { runReadOnlyQuery } from "@/server/gamedb-query-runner";

// Test-run raw SQL before saving it as a query. Super admin only because the
// SQL comes straight from the request body.
export async function POST(request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const result = await runReadOnlyQuery(body.sqlText);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, "ไม่สามารถรัน SQL ได้");
  }
}
