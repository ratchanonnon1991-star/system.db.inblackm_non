import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { declineItuneReject } from "@/server/itune-entries-repository";

// "ปฏิเสธคำขอ" button on a pending 'reject' request row in the ประวัติ tab
// of Log คนเติม (see itune-topup-log.js) — dismisses rejectItuneEntry's
// request without any effect on the entry, which was never touched by the
// request in the first place. Admin-only.
export async function POST(request, { params }) {
  try {
    const admin = await requireProjectmAdmin(request);
    const { id } = await params;
    const entry = await declineItuneReject(id, admin);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "ปฏิเสธคำขอไม่สำเร็จ");
  }
}
