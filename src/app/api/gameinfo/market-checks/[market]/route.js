import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoMarketChecker } from "@/server/auth";
import { getGameinfoMarketCheckRun, resetGameinfoMarketCheck, startGameinfoMarketCheck } from "@/server/gameinfo-market-system";

export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ run: await getGameinfoMarketCheckRun(Number((await params).market)) });
  } catch (error) {
    return handleApiError(error, "โหลดสถานะ Market Check ไม่สำเร็จ");
  }
}

export async function POST(request, { params }) {
  try {
    const user = await requireGameinfoMarketChecker(request);
    const result = await startGameinfoMarketCheck((await params).market, user, "manual");
    return jsonOk(result, 202);
  } catch (error) {
    return handleApiError(error, "เริ่ม Market Check ไม่สำเร็จ");
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireGameinfoMarketChecker(request);
    return jsonOk(await resetGameinfoMarketCheck((await params).market));
  } catch (error) {
    return handleApiError(error, "รีเซ็ตสถานะ Market Check ไม่สำเร็จ");
  }
}
