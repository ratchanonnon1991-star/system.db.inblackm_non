import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { getRussiaCheckRun } from "@/server/gameinfo-russia-check";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ run: await getRussiaCheckRun(Number((await params).id)) });
  } catch (error) {
    return handleApiError(error, "โหลดสถานะ Russia Check ไม่สำเร็จ");
  }
}
