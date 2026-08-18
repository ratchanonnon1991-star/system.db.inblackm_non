import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { clearItuneLogs } from "@/server/itune-entries-repository";

// Dev-only utility (see the "ลบ Log ทั้งหมด (Dev)" button in
// itune-topup-log.js) — wipes every itune history table (issue/reject log,
// amount log, claim-workflow log). Does NOT touch projectm_itune_entries.
// Admin-gated, but this is meant for testing/cleanup, not a routine admin
// action — irreversible.
export async function POST(request) {
  try {
    await requireProjectmAdmin(request);
    await clearItuneLogs();
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, "ลบ Log ไม่สำเร็จ");
  }
}
