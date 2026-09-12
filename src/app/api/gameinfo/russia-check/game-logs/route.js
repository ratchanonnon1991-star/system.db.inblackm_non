import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { getRussiaCheckGameLog } from "@/server/gameinfo-russia-check";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk(await getRussiaCheckGameLog());
  } catch (error) {
    return handleApiError(error, "โหลด Log รายเกมไม่สำเร็จ");
  }
}
