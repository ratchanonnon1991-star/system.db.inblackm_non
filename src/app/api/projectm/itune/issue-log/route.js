import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { listItuneIssueLog } from "@/server/itune-entries-repository";

export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit")) || 200;
    const resolvedParam = url.searchParams.get("resolved");
    const resolved =
      resolvedParam === "true" ? true : resolvedParam === "false" ? false : undefined;

    const issues = await listItuneIssueLog({ limit, resolved });
    return jsonOk({ issues });
  } catch (err) {
    return handleApiError(err, "โหลดประวัติการแจ้งปัญหาไม่สำเร็จ");
  }
}
