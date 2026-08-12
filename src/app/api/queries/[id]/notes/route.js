import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { findQueryById } from "@/server/gamedb-repository";
import { listNotes, upsertNote } from "@/server/gamedb-cell-notes";
import { normalizeLayout } from "@/lib/gamedb-layout";

// Notes are an annotation layer in gamedb's own database -- they never touch
// the connected database a query points at, so any signed-in role can read
// and write them, the same as viewing the query itself. A query needs a
// configured pk to anchor a note to a specific row across refreshes/sorts.
async function loadQueryWithPk(request, params) {
  const admin = await requireAdmin(request);
  const { id } = await params;
  const queryId = Number(id);
  if (!Number.isInteger(queryId) || queryId <= 0) {
    return { error: jsonError("Query ไม่ถูกต้อง", 400) };
  }
  const query = await findQueryById(queryId);
  if (!query) return { error: jsonError("ไม่พบ Query นี้", 404) };
  const layout = normalizeLayout(query.layout);
  if (!layout.editable?.pk) {
    return { error: jsonError("Query นี้ยังไม่ได้ตั้งค่าคอลัมน์ key ไว้", 400) };
  }
  return { admin, queryId, layout };
}

export async function GET(request, { params }) {
  try {
    const target = await loadQueryWithPk(request, params);
    if (target.error) return target.error;
    const notes = await listNotes(target.queryId);
    return jsonOk({ notes });
  } catch (err) {
    return handleApiError(err, "โหลดโน้ตไม่สำเร็จ");
  }
}

const MAX_NOTE_LENGTH = 2000;

export async function POST(request, { params }) {
  try {
    const target = await loadQueryWithPk(request, params);
    if (target.error) return target.error;
    const { admin, queryId } = target;

    const body = await request.json();
    const pkValue = body.pkValue;
    // A note is a plain data column, never used to build SQL, so there is
    // nothing here to validate beyond a sane length -- unlike editable.columns
    // (which becomes a quoted identifier) it can name any result column,
    // computed or joined in included, since annotating those is just as
    // legitimate as annotating a writable one.
    const column = String(body.column || "").slice(0, 255);
    if (pkValue === null || pkValue === undefined || pkValue === "" || !column) {
      return jsonError("ไม่มีเซลล์ที่จะปักโน้ต", 400);
    }

    const note = await upsertNote({
      queryId,
      pkValue,
      column,
      note: String(body.note || "").slice(0, MAX_NOTE_LENGTH),
      author: admin.username || admin.displayName || "",
    });
    return jsonOk({ note });
  } catch (err) {
    return handleApiError(err, "บันทึกโน้ตไม่สำเร็จ");
  }
}
