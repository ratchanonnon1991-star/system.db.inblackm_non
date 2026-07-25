import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findQueryById } from "@/server/gamedb-repository";
import { runReadOnlyQuery } from "@/server/gamedb-query-runner";

export async function POST(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const result = await runReadOnlyQuery(query.sqlText);
    return jsonOk({ ...result, queryId: query.id, layout: query.layout });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถรัน Query ได้");
  }
}
