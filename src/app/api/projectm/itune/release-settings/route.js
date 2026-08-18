import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { saveItuneReleaseThreshold } from "@/server/itune-entries-repository";

// Admin-only — see ItuneReleaseSettingsModal in itune-admin-table.js, the
// only caller. The topup page reads the current value via a server-side
// getItuneReleaseThreshold() call in its own page.js, not this route.
export async function PUT(request) {
  try {
    const admin = await requireProjectmAdmin(request);
    const body = await request.json();
    const numeric = Number(body.maxAmount);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return jsonError("ยอดต้องเป็นตัวเลขไม่ติดลบ", 400);
    }
    const maxAmount = await saveItuneReleaseThreshold(numeric, admin);
    return jsonOk({ maxAmount });
  } catch (err) {
    return handleApiError(err, "บันทึกการตั้งค่าคืนเมลไม่สำเร็จ");
  }
}
