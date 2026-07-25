import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";

export async function GET(request) {
  try {
    const user = await requireAdmin(request);
    return jsonOk({ user });
  } catch (err) {
    return handleApiError(err, "ตรวจสอบสิทธิ์ไม่สำเร็จ");
  }
}
