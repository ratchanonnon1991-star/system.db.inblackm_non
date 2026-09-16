import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { getRazerSyncJob } from "@/server/profit-razer-sync-jobs";

export async function GET(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { jobId } = await params;
    const job = getRazerSyncJob(jobId);
    if (!job) return jsonError("ไม่พบงาน sync", 404);
    return jsonOk({ job });
  } catch (err) {
    return handleApiError(err, "อ่านสถานะ sync ไม่สำเร็จ");
  }
}
