import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { saveItuneClaimSettings } from "@/server/itune-entries-repository";

// Admin-only writer for the projectm_itune_release_settings singleton —
// shared by ItuneReleaseSettingsModal in itune-admin-table.js (maxAmount)
// and the priority page's queue controls (claimPaused,
// priorityAmountThreshold). Every field is optional and only the ones
// present are written, so the two callers never clobber each other's
// settings. Reads happen server-side in the relevant page.js, not here.
export async function PUT(request) {
  try {
    const admin = await requireProjectmAdmin(request);
    const body = await request.json();
    const fields = {};

    if (body.maxAmount !== undefined) {
      const numeric = Number(body.maxAmount);
      if (!Number.isFinite(numeric) || numeric < 0) {
        return jsonError("ยอดต้องเป็นตัวเลขไม่ติดลบ", 400);
      }
      fields.maxAmount = numeric;
    }

    if (body.priorityAmountThreshold !== undefined) {
      const numeric = Number(body.priorityAmountThreshold);
      if (!Number.isFinite(numeric) || numeric < 0) {
        return jsonError("เกณฑ์ยอดด่วนต้องเป็นตัวเลขไม่ติดลบ", 400);
      }
      fields.priorityAmountThreshold = numeric;
    }

    if (body.claimPaused !== undefined) {
      fields.claimPaused = Boolean(body.claimPaused);
    }

    if (!Object.keys(fields).length) {
      return jsonError("ไม่มีการตั้งค่าที่จะบันทึก", 400);
    }

    const settings = await saveItuneClaimSettings(fields, admin);
    return jsonOk(settings);
  } catch (err) {
    return handleApiError(err, "บันทึกการตั้งค่าไม่สำเร็จ");
  }
}
