import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { listItuneClaimLog } from "@/server/itune-entries-repository";

// "ประวัติ" tab of the admin "log คนเติม" page — see itune-claim-log.js.
export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit")) || 200;
    const logs = await listItuneClaimLog({ limit });
    return jsonOk({ logs });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติการรับ/คืนเมลไม่สำเร็จ");
  }
}
