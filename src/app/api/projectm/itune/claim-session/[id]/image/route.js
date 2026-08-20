import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { getItuneClaimSessionImage } from "@/server/itune-entries-repository";

export async function GET(request, { params }) {
  try {
    await requireProjectmAdmin(request);
    const { id } = await params;
    const sessionId = Number(id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) return jsonError("id ไม่ถูกต้อง", 400);
    const image = await getItuneClaimSessionImage(sessionId);
    return jsonOk({ image });
  } catch (err) {
    return handleApiError(err, "โหลดรูปหลักฐานไม่สำเร็จ");
  }
}
