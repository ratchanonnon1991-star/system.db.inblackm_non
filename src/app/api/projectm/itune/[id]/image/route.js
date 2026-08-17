import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { findItuneEntryById, saveItuneEntryImage } from "@/server/itune-entries-repository";

// Base64 data: URLs run ~1.37x the source bytes; the picker caps uploads at
// 4MB client-side, so ~6MB of encoded text is a generous server-side backstop
// against a client that skips that check.
const MAX_IMAGE_URL_LENGTH = 6_000_000;

export async function PUT(request, { params }) {
  try {
    await requireProjectmAdmin(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const body = await request.json();
    const imageUrl = String(body.imageUrl || "").trim();
    if (imageUrl.length > MAX_IMAGE_URL_LENGTH) {
      return jsonError("รูปภาพมีขนาดใหญ่เกินไป", 400);
    }

    const entry = await saveItuneEntryImage(id, imageUrl);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "บันทึกรูปไม่สำเร็จ");
  }
}
