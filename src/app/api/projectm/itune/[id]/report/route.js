import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import {
  findItuneEntryById,
  reportItuneEntryIssue,
  resolveItuneEntryIssue,
} from "@/server/itune-entries-repository";

const MAX_NOTE_LENGTH = 2000;

export async function POST(request, { params }) {
  try {
    const admin = await requireProjectmAdmin(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const body = await request.json();
    const note = String(body.note || "").trim();
    if (!note) return jsonError("กรุณากรอกปัญหาที่พบ", 400);
    if (note.length > MAX_NOTE_LENGTH) {
      return jsonError("ข้อความยาวเกินไป", 400);
    }

    const entry = await reportItuneEntryIssue(id, note, admin);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "แจ้งปัญหาไม่สำเร็จ");
  }
}

// Undo — brings the row back to its amount-derived status.
export async function DELETE(request, { params }) {
  try {
    const admin = await requireProjectmAdmin(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const entry = await resolveItuneEntryIssue(id, admin);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "เปลี่ยนสถานะไม่สำเร็จ");
  }
}
