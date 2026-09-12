import { requireGameinfoEditor } from "@/server/auth";
import { getGameinfoColumnDeletionImpact } from "@/server/gameinfo-gamelist-packs";
import { handleApiError, jsonError, jsonOk } from "@/lib/http";

export async function GET(request, { params }) {
  try {
    await requireGameinfoEditor(request);
    const key = String((await params).key || "").trim();
    if (!key) return jsonError("column key ไม่ถูกต้อง", 400);
    const impact = await getGameinfoColumnDeletionImpact(key);
    if (!impact.column) return jsonError("ไม่พบคอลัมน์", 404);
    return jsonOk(impact);
  } catch (error) {
    return handleApiError(error, "โหลดรายการอ้างอิงคอลัมน์ไม่สำเร็จ");
  }
}
