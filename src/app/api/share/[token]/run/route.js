import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { lookupsFromLayout } from "@/lib/gamedb-layout";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { runReadOnlyQuery } from "@/server/gamedb-query-runner";
import { getCachedResult, setCachedResult } from "@/server/gamedb-result-cache";
import { findQueryIdByToken } from "@/server/gamedb-shares-repository";

/**
 * The only route in the app that answers without a session, so what it may
 * reach is pinned down here rather than taken from the request:
 *
 * - the query is the one the token was issued for, never an id from the caller;
 * - a pulled-in table, if there is one, comes from the shared query's own
 *   layout, so a link cannot be pointed at a table nobody shared — `lookupId`
 *   only *selects among* those, it never names a query directly;
 * - nothing about the connection is returned, only rows and column names.
 *
 * Values for :placeholders are accepted — filtering is the point of the link —
 * and they go through the same binding as everywhere else, so they stay values.
 */
export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const queryId = await findQueryIdByToken(token);
    if (!queryId) return jsonError("ลิงก์นี้ใช้ไม่ได้แล้ว", 404);

    const shared = await findQueryById(queryId);
    if (!shared) return jsonError("ลิงก์นี้ใช้ไม่ได้แล้ว", 404);

    let values = {};
    let offset;
    let limit;
    let merge = false;
    let lookupId = "";
    try {
      const body = await request.json();
      if (body?.params && typeof body.params === "object") values = body.params;
      if (body?.offset !== undefined) offset = body.offset;
      if (body?.limit !== undefined) limit = body.limit;
      merge = Boolean(body?.merge);
      lookupId = typeof body?.lookupId === "string" ? body.lookupId : "";
    } catch {
      // no body — nothing to bind
    }

    let query = shared;
    if (merge) {
      const lookups = lookupsFromLayout(shared.layout);
      // No lookupId is the pre-lookups client, which only ever meant "the one
      // merge this query has" -- the first (and only) entry in that case.
      const target = lookupId ? lookups.find((item) => item.id === lookupId) : lookups[0];
      if (!target) return jsonError("Query นี้ไม่ได้ตั้งค่าการดึงคอลัมน์จาก Query อื่น", 404);
      query = await findQueryById(target.queryId);
      if (!query) return jsonError("Query ที่ดึงไว้ถูกลบไปแล้ว", 409);
      // The pulled-in side is joined against, not filtered by the viewer.
      values = {};
      offset = undefined;
      limit = undefined;
    }

    const connection = query.connectionId
      ? await findConnectionWithSecret(query.connectionId)
      : null;
    if (query.connectionId && !connection) {
      return jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว", 409);
    }

    const descriptor = {
      queryId: query.id,
      connectionId: query.connectionId,
      params: values,
      offset,
      limit,
    };
    // A link can be opened by any number of people at once, so a public read
    // always takes the shared cache — there is no "fresh" flag to bypass it.
    const cached = getCachedResult(descriptor);
    if (cached) {
      return jsonOk({ ...cached, queryId: query.id, layout: query.layout, cached: true });
    }

    const result = await runReadOnlyQuery(query.sqlText, connection, values, {
      offset,
      limit,
    });
    setCachedResult(descriptor, result);
    return jsonOk({ ...result, queryId: query.id, layout: query.layout });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถรัน Query ได้");
  }
}
