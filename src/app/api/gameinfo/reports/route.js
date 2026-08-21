import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { listOpenGamelistReports } from "@/server/gameinfo-gamelist-reports";

export async function GET(request) {
  try {
    await requireGameinfoEditor(request);
    return jsonOk({ reports: await listOpenGamelistReports() });
  } catch (error) {
    return handleApiError(error, "โหลด reports ที่ต้องตรวจสอบไม่สำเร็จ");
  }
}
