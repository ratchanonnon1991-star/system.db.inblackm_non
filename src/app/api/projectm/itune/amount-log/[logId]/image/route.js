import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmTopup } from "@/server/auth";
import { getItuneAmountLogImage } from "@/server/itune-entries-repository";

export async function GET(request, { params }) {
  try {
    const actor = await requireProjectmTopup(request);
    const { logId } = await params;
    const image = await getItuneAmountLogImage(logId, actor);
    if (!image) return jsonError("ไม่พบรูปยืนยัน", 404);

    const response = jsonOk({ image });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (err) {
    return handleApiError(err, "โหลดรูปยืนยันไม่สำเร็จ");
  }
}
