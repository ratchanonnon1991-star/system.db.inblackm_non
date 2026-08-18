import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { confirmItuneReject } from "@/server/itune-entries-repository";

// "ยืนยัน" button on a pending 'reject' request row in the ประวัติ tab of
// Log คนเติม (see itune-topup-log.js) — approves rejectItuneEntry's request:
// unclaims the entry (open to everyone else immediately) and permanently
// excludes just the requesting user from claiming it again. Admin-only.
export async function POST(request, { params }) {
  try {
    const admin = await requireProjectmAdmin(request);
    const { id } = await params;
    const entry = await confirmItuneReject(id, admin);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "ยืนยัน reject ไม่สำเร็จ");
  }
}
