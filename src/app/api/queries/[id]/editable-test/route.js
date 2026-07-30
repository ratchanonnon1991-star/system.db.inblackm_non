import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { findQueryById } from "@/server/gamedb-repository";
import { buildAllSql, checkEditable } from "@/server/gamedb-editable-check";
import { sanitizeLayout } from "@/server/gamedb-layout-sanitizer";

/**
 * A dry run of the edit config: what the writer would issue, and whether the
 * database agrees it would work. Writes nothing.
 *
 * The config comes in the body rather than from the saved query, because the
 * point is to try it before saving it. It goes through the same sanitizer the
 * save endpoint uses, so what is reported on is what would be stored -- and the
 * table and column names are checked there before anything is quoted into SQL.
 */
export async function POST(request, { params }) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const body = await request.json();
    const { editable } = sanitizeLayout({ editable: body.editable });
    if (!editable) {
      return jsonError("ยังกรอกตารางหรือคอลัมน์ key ไม่ครบ", 400);
    }

    // Listing the statements needs no database at all, so it answers even when
    // the connection is gone or the checks cannot run.
    const groups = buildAllSql(editable);

    const connection = query.connectionId
      ? await findConnectionWithSecret(query.connectionId)
      : null;
    if (query.connectionId && !connection) {
      return jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว", 409);
    }

    const { checks, sql } = await checkEditable({ editable, connection });
    return jsonOk({ checks, sql, groups, ok: checks.every((check) => check.ok) });
  } catch (err) {
    return handleApiError(err, "ทดสอบการตั้งค่าไม่สำเร็จ");
  }
}
