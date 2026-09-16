import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { startRazerAccountSyncJob } from "@/server/profit-razer-sync-jobs";

/** Playwright login can exceed reverse-proxy idle limits; work runs in a background job. */
export const maxDuration = 300;

export async function POST(request, { params }) {
  try {
    await requireProfitEditor(request);
    const { id } = await params;
    const job = startRazerAccountSyncJob(id);
    return jsonOk({ job, jobId: job.id, async: true });
  } catch (err) {
    return handleApiError(err, "ดึงยอด Razer ไม่สำเร็จ");
  }
}
