import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { listItuneEntryLogs } from "@/server/itune-entries-repository";

export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
    const limit = new URL(request.url).searchParams.get("limit") || 200;
    return jsonOk({ logs: await listItuneEntryLogs(limit) });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติรายการไม่สำเร็จ");
  }
}
