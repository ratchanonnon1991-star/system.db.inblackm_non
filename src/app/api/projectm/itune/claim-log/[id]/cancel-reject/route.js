import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { cancelItuneReject } from "@/server/itune-entries-repository";

// "ยกเลิก" button on a 'reject' row in the ประวัติ tab of Log คนเติม (see
// itune-topup-log.js) — undoes rejectItuneEntry: clears the permanent
// per-user claim exclusion and, if it's still the entry's active
// unavailable reason, brings the entry back to normal. Admin-only, same
// gate as the rest of the topup log.
export async function POST(request, { params }) {
  try {
    const admin = await requireProjectmAdmin(request);
    const { id } = await params;
    const entry = await cancelItuneReject(id, admin);
    return jsonOk({ entry });
  } catch (err) {
    return handleApiError(err, "ยกเลิก reject ไม่สำเร็จ");
  }
}
