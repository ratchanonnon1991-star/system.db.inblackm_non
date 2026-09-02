import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess } from "@/server/auth";
import { fetchG2GPage, normalizeG2GGroup } from "@/server/g2g-prices";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const { searchParams } = new URL(request.url);
    const page = await fetchG2GPage(searchParams.get("game"), normalizeG2GGroup(searchParams.get("unit")), {
      force: searchParams.get("refresh") === "1",
    });
    return jsonOk({ page });
  } catch (error) {
    return handleApiError(error, "รีเฟรชข้อมูลราคา G2G ไม่สำเร็จ");
  }
}
