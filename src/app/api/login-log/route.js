import { handleApiError, jsonOk } from "@/lib/http";
import { requireSuperAdmin } from "@/server/auth";
import { listLogins } from "@/server/gamedb-login-log";

export async function GET(request) {
  try {
    await requireSuperAdmin(request);
    const limit = Number(new URL(request.url).searchParams.get("limit") || 100);
    const logins = await listLogins(limit);
    return jsonOk({ logins });
  } catch (err) {
    return handleApiError(err, "ไม่สามารถโหลดประวัติการเข้าสู่ระบบได้");
  }
}
