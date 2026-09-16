import { handleApiError, jsonOk } from "@/lib/http";
import { requireProfitEditor } from "@/server/auth";
import { startRazerSyncAllJob } from "@/server/profit-razer-sync-jobs";

export const maxDuration = 300;

export async function POST(request) {
  try {
    await requireProfitEditor(request);
    const body = await request.json().catch(() => ({}));
    const job = startRazerSyncAllJob({ zone: body.zone || undefined });
    return jsonOk({ job, jobId: job.id, async: true });
  } catch (err) {
    return handleApiError(err, "ดึงยอด Razer ทั้งหมดไม่สำเร็จ");
  }
}
