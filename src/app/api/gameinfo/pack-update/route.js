import { handleApiError, jsonOk } from "@/lib/http";
import { normalizeGameinfoDataMode } from "@/lib/gameinfo-data-mode";
import { requireGameinfoAccess } from "@/server/auth";
import { listGameinfoPackUpdatePacks } from "@/server/gameinfo-pack-update";

// Pack Update opens from the game list without reloading the page; this
// brings the one thing the list does not have, every game's packs.
export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    const mode = normalizeGameinfoDataMode(request.nextUrl.searchParams.get("mode"));
    return jsonOk({ packsByGame: await listGameinfoPackUpdatePacks(mode) });
  } catch (error) {
    return handleApiError(error, "โหลดแพ็คของ Pack Update ไม่สำเร็จ");
  }
}
