import { handleApiError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { listEdits } from "@/server/gamedb-edit-log";

export async function GET(request) {
  try {
    await requireSuperAdmin(request);
    const limit = Number(new URL(request.url).searchParams.get("limit") || 100);
    const edits = await listEdits(limit);
    return jsonOk({ edits });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดประวัติการแก้ไขได้");
  }
}
