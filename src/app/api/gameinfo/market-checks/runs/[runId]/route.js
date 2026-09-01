import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { getGameinfoMarketCheckRun } from "@/server/gameinfo-market-system";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ run: await getGameinfoMarketCheckRun(Number((await params).runId)) });
  } catch (error) {
    return handleApiError(error, "โหลดสถานะ Market Check ไม่สำเร็จ");
  }
}
