import { normalizeLayout } from "@/lib/gamedb-layout";
import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireLayoutEditor } from "@/server/auth";
import { findConnectionWithSecret } from "@/server/connections-repository";
import { recordEdit } from "@/server/gamedb-edit-log";
import { findQueryById } from "@/server/gamedb-repository";
import { runInsertForm } from "@/server/gamedb-insert-runner";
import { invalidateQuery } from "@/server/gamedb-result-cache";
import { requestMeta } from "@/lib/request-meta";

/**
 * Writing the script is an admin's job; running it is not. This is the one
 * write in the app a non-admin editor may perform, and it is narrow by
 * construction: the statement is the one saved on the query, taken from the
 * shared layout — not from this user's own copy and not from the request — so
 * the only thing the caller decides is what goes in the boxes.
 */
export async function POST(request, { params }) {
  try {
    const user = await requireLayoutEditor(request);
    const { id } = await params;
    const query = await findQueryById(id);
    if (!query) return jsonError("ไม่พบ Query นี้", 404);

    const layout = normalizeLayout(query.layout);
    if (!layout.insertForm) {
      return jsonError("Query นี้ยังไม่ได้ตั้งค่าฟอร์มเพิ่มข้อมูล", 400);
    }

    const connection = query.connectionId
      ? await findConnectionWithSecret(query.connectionId)
      : null;
    if (query.connectionId && !connection) {
      return jsonError("ฐานข้อมูลของ Query นี้ถูกลบไปแล้ว", 409);
    }

    const body = await request.json().catch(() => ({}));
    const values =
      body?.values && typeof body.values === "object" && !Array.isArray(body.values)
        ? body.values
        : {};

    const result = await runInsertForm({
      insertForm: layout.insertForm,
      connection,
      values,
    });

    // The log was built for cell edits, so an insert is recorded as one entry
    // whose "new value" is the filled-in form: the labels are the admin's, the
    // values are what was typed, and that is what anyone reading it later needs.
    await recordEdit({
      queryId: query.id,
      actor: user.username || "",
      table: layout.insertForm.label || "ฟอร์มเพิ่มข้อมูล",
      pkColumn: "-",
      pkValue: null,
      column: "insert",
      oldValue: null,
      newValue: (layout.insertForm.fields || [])
        .map((field) => `${field.label || field.name}=${values[field.name] ?? ""}`)
        .join(", "),
      ...requestMeta(request),
    });
    invalidateQuery(query.id);

    return jsonOk({ ok: true, rowCount: result.rowCount });
  } catch (err) {
    return handleApiError(err, "เพิ่มข้อมูลไม่สำเร็จ");
  }
}
