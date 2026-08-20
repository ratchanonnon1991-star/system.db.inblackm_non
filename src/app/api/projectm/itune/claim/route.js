import { handleApiError, jsonOk } from "@/lib/http";
import { requireProjectmAccess } from "@/server/auth";
import { claimItuneEntry, listClaimedItuneEntriesForUser } from "@/server/itune-entries-repository";

// claimItuneEntry enforces the per-user cap and picks the lowest-id available row.
export async function POST(request) {
  try {
    const actor = await requireProjectmAccess(request);
    const entry = await claimItuneEntry(actor);
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
    const actor = await requireProjectmAccess(request);
    const entries = await listClaimedItuneEntriesForUser(actor.id);
    return jsonOk({ entries });
  } catch (err) {
    return handleApiError(err, "โหลดรายการที่ถืออยู่ไม่สำเร็จ");
  }
}
