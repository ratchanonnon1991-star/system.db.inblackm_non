import { handleApiError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/server/auth";
import { setCollectorRunning } from "@/server/social-feed-repository";

export async function POST(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    return jsonOk({ running: await setCollectorRunning(body.running === true) });
  } catch (error) {
    return handleApiError(error, "เปลี่ยนสถานะการอ่านไม่สำเร็จ");
  }
}
