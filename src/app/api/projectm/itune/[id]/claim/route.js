import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAccess } from "@/server/auth";
import { findItuneEntryById, releaseItuneEntry } from "@/server/itune-entries-repository";

const MAX_IMAGE_URL_LENGTH = 6_000_000;

export async function DELETE(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const raw = await request.text();
    let details = null;
    if (raw) {
      try {
        details = JSON.parse(raw);
      } catch {
        return jsonError("รูปแบบข้อมูลไม่ถูกต้อง", 400);
      }
      const image = String(details?.image || "").trim();
      if (image.length > MAX_IMAGE_URL_LENGTH) {
        return jsonError("รูปภาพมีขนาดใหญ่เกินไป", 400);
      }
      details = {
        outcome: String(details?.outcome || ""),
        amount: details?.amount,
        image,
        note: String(details?.note || "").trim(),
      };
    }

    const entry = await releaseItuneEntry(id, actor, details);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "บันทึกผลและคืนเมลไม่สำเร็จ");
  }
}
