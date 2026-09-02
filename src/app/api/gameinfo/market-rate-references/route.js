import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import {
  deleteGameinfoMarketRateReference,
  listGameinfoMarketRateReferenceOptions,
  saveGameinfoMarketRateReference,
} from "@/server/gameinfo-market-system";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ markets: await listGameinfoMarketRateReferenceOptions() });
  } catch (error) {
    return handleApiError(error, "โหลดเวลาอ้างอิงเรทไม่สำเร็จ");
  }
}

export async function PUT(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const reference = await saveGameinfoMarketRateReference(await request.json(), user);
    return jsonOk({ reference });
  } catch (error) {
    return handleApiError(error, "บันทึกเวลาอ้างอิงเรทไม่สำเร็จ");
  }
}

export async function DELETE(request) {
  try {
    await requireGameinfoEditor(request);
    const query = request.nextUrl.searchParams;
    const reference = await deleteGameinfoMarketRateReference(query.get("market"), query.get("game"));
    return jsonOk({ reference });
  } catch (error) {
    return handleApiError(error, "ลบเวลาอ้างอิงเรทไม่สำเร็จ");
  }
}
