import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { fetchLookupOptions } from "@/server/gamedb-lookup";
import { normalizeLayout } from "@/lib/gamedb-layout";

/**
 * The dropdown lists for every lookup field this query has configured.
 *
 * Admin only, like the writes they exist to serve: the lists come from tables
 * the query does not itself select from, and only someone who may write should
 * be reading them.
 */
export async function GET(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const layout = normalizeLayout(query.layout);
    const lookups = (layout.editable?.inputs || []).filter(
      (input) => input.widget === "lookup" && input.lookup
    );
    if (lookups.length === 0) return jsonOk({ options: {} });

    const connection = query.connectionId
      ? await findConnectionWithSecret(query.connectionId)
      : null;
    if (query.connectionId && !connection) {
      return jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว", 409);
    }

    const options = {};
    const failed = {};
    for (const input of lookups) {
      try {
        options[input.column] = await fetchLookupOptions({ lookup: input.lookup, connection });
      } catch (err) {
        // One misconfigured field should not cost the others their lists.
        failed[input.column] = err.message;
        options[input.column] = [];
      }
    }

    return jsonOk({ options, failed });
  } catch (err) {
    return handleApiError(err, "โหลดรายการตัวเลือกไม่สำเร็จ");
  }
}
