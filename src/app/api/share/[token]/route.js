import { extractSqlParams } from "@/lib/gamedb-sql-params";
import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { findQueryById } from "@/server/gamedb-repository";
import { findQueryIdByToken } from "@/server/gamedb-shares-repository";

/**
 * What a link needs to draw the table, and nothing else.
 *
 * The SQL never leaves the server — a viewer has no use for it, and it names
 * every table and column the query touches. Only the placeholder names go out,
 * because the filter boxes are drawn from them. The parts of the layout that
 * describe actions a viewer cannot take are dropped for the same reason:
 * `editable` carries the real table and primary key, and `drill` points at a
 * query that was never shared.
 */
export async function GET(request, { params }) {
  try {
    const { token } = await params;
    const queryId = await findQueryIdByToken(token);
    if (!queryId) return jsonError("ลิงก์นี้ใช้ไม่ได้แล้ว", 404);

    const query = await findQueryById(queryId);
    if (!query) return jsonError("ลิงก์นี้ใช้ไม่ได้แล้ว", 404);

    const { editable, drill, ...layout } = query.layout || {};
    return jsonOk({
      query: {
        id: query.id,
        name: query.name,
        description: query.description,
        layout,
        paramNames: extractSqlParams(query.sqlText),
      },
    });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถเปิดลิงก์นี้ได้");
  }
}
