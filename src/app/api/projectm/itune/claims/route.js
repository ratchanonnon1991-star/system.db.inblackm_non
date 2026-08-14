import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { listClaimedItuneEntries } from "@/server/itune-entries-repository";

// "ปัจจุบัน" (live) tab of the admin "log คนเติม" page — see
// itune-claim-log.js.
export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
    const entries = await listClaimedItuneEntries();
    return jsonOk({ entries });
  } catch (err) {
    return handleApiError(err, "โหลดรายการที่ถืออยู่ไม่สำเร็จ");
  }
}
