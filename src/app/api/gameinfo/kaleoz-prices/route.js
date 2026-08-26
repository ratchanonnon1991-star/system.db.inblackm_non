import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { fetchKaleozPage, normalizeKaleozGame, normalizeKaleozProductType } from "@/server/kaleoz-zepeto";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const { searchParams } = new URL(request.url);
    const game = normalizeKaleozGame(searchParams.get("game"));
    const productType = normalizeKaleozProductType(searchParams.get("unit"));
    const page = await fetchKaleozPage(game, productType, { force: searchParams.get("refresh") === "1" });
    return jsonOk({ page });
  } catch (error) {
    return handleApiError(error, "รีข้อมูลราคา Kaleoz ไม่สำเร็จ");
  }
}
