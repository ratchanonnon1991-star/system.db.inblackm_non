import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAccess } from "@/server/auth";
import { findItuneEntryById, updateItuneEntryAmount } from "@/server/itune-entries-repository";

// Same backstop as [id]/image/route.js's MAX_IMAGE_URL_LENGTH.
const MAX_IMAGE_URL_LENGTH = 6_000_000;

function parseAmount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : NaN;
}

// "อัปเดตยอดคงเหลือ" — a topup user recording what's left on a card they're
// holding, optionally with a fresh confirm image. updateItuneEntryAmount
// enforces that only the claimant (or a projectm-admin) may do this, and
// logs the old→new change to projectm_itune_amount_log.
export async function PUT(request, { params }) {
  try {
    const actor = await requireProjectmAccess(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const body = await request.json();
    const amount = parseAmount(body.amount);
    if (Number.isNaN(amount)) {
      return jsonError("Amount ต้องเป็นตัวเลขไม่ติดลบ", 400);
    }

    let image;
    if (body.image !== undefined) {
      image = String(body.image || "").trim();
      if (image.length > MAX_IMAGE_URL_LENGTH) {
        return jsonError("รูปภาพมีขนาดใหญ่เกินไป", 400);
      }
    }

    const entry = await updateItuneEntryAmount(id, { amount, image }, actor);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "บันทึกยอดคงเหลือไม่สำเร็จ");
  }
}
