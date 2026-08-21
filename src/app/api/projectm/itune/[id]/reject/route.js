import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmTopup } from "@/server/auth";
import { findItuneEntryById, rejectItuneEntry } from "@/server/itune-entries-repository";

const MAX_REASON_LENGTH = 2000;

// "Reject" — the claimant's own request to give this entry back (see
// ItuneRejectRequestModal in the topup card). rejectItuneEntry enforces that only the
// current claimant (or a projectm-admin) may do this.
export async function POST(request, { params }) {
  try {
    const actor = await requireProjectmTopup(request);
    const { id } = await params;
    const target = await findItuneEntryById(id);
    if (!target) return jsonError("ไม่พบรายการนี้", 404);

    const body = await request.json();
    const reason = String(body.reason || "").trim();
    if (!reason) return jsonError("กรุณากรอกเหตุผลที่ขอ Reject", 400);
    if (reason.length > MAX_REASON_LENGTH) return jsonError("เหตุผลยาวเกินไป", 400);

    const entry = await rejectItuneEntry(id, reason, actor);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "ส่งคำขอ Reject ไม่สำเร็จ");
  }
}
