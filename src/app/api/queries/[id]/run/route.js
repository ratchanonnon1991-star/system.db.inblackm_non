import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { runReadOnlyQuery } from "@/server/gamedb-query-runner";
import { getCachedResult, setCachedResult } from "@/server/gamedb-result-cache";

export async function POST(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const connection = query.connectionId
      ? await findConnectionWithSecret(query.connectionId)
      : null;
    if (query.connectionId && !connection) {
      return jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว กรุณาแก้ไข Query", 409);
    }

    // Body is optional: a query without :placeholders is run with no values.
    let values = {};
    let page = {};
    let fresh = false;
    try {
      const body = await request.json();
      if (body?.params && typeof body.params === "object") values = body.params;
      if (body?.offset !== undefined) page.offset = body.offset;
      if (body?.limit !== undefined) page.limit = body.limit;
      fresh = Boolean(body?.fresh);
    } catch {
      // no body — nothing to bind
    }

    const descriptor = {
      queryId: query.id,
      connectionId: query.connectionId,
      params: values,
      offset: page.offset,
      limit: page.limit,
    };
    const cached = fresh ? null : getCachedResult(descriptor);
    if (cached) {
      return jsonOk({ ...cached, queryId: query.id, layout: query.layout, cached: true });
    }

    const result = await runReadOnlyQuery(query.sqlText, connection, values, page);
    setCachedResult(descriptor, result);
    return jsonOk({ ...result, queryId: query.id, layout: query.layout });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถรัน Query ได้");
  }
}
