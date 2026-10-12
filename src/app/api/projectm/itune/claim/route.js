import { handleApiError, jsonError, jsonOk } from "@/lib/http";
import { requireProjectmTopup } from "@/server/auth";
import {
  claimItuneEntry,
  getItuneClaimSettings,
  listClaimableItuneEntriesForUser,
  listClaimedItuneEntriesForUser,
} from "@/server/itune-entries-repository";

// claimItuneEntry enforces the per-user cap and atomically claims the row the
// user selected. An empty body remains supported for older clients and falls
// back to the queue's first available row.
export async function POST(request) {
  try {
    const actor = await requireProjectmTopup(request);
    const raw = await request.text();
    let entryId = null;
    if (raw) {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return jsonError("รูปแบบข้อมูลไม่ถูกต้อง", 400);
      }
      entryId = Number(body?.entryId);
      if (!Number.isInteger(entryId) || entryId <= 0) {
        return jsonError("รายการเมลไม่ถูกต้อง", 400);
      }
    }
    const entry = await claimItuneEntry(actor, entryId);
    return jsonOk({ entry }, 201);
  } catch (err) {
    return handleApiError(err, "รับเมลไม่สำเร็จ");
  }
}

// Read side for the topup page's own poll (see itune-topup-view.js) — the
// page itself only fetches this server-side on first load; a client-side
// GET is what lets it pick up changes another session made (most notably,
// an admin confirming/declining a pending "Reject" — see confirmItuneReject/
// declineItuneReject) without the user having to reload.
export async function GET(request) {
  try {
    const actor = await requireProjectmTopup(request);
    const settings = await getItuneClaimSettings();
    const [entries, availableEntries] = await Promise.all([
      listClaimedItuneEntriesForUser(actor.id),
      listClaimableItuneEntriesForUser(actor.id, settings),
    ]);
    return jsonOk({ entries, availableEntries, claimPaused: settings.claimPaused, queueSettings: settings });
  } catch (err) {
    return handleApiError(err, "โหลดรายการที่ถืออยู่ไม่สำเร็จ");
  }
}
