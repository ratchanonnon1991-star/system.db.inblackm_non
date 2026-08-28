import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { fetchItemkuPage, normalizeItemkuGroup } from "@/server/itemku-prices";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const { searchParams } = new URL(request.url);
    const page = await fetchItemkuPage(searchParams.get("game"), normalizeItemkuGroup(searchParams.get("unit")), {
      force: searchParams.get("refresh") === "1",
    });
    return jsonOk({ page });
  } catch (error) {
    return handleApiError(error, "รีเฟรชข้อมูลราคา itemku ไม่สำเร็จ");
  }
}
