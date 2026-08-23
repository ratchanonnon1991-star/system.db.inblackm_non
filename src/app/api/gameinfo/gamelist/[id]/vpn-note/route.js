import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import {
  getGamelistVpnNote,
  listAllGamelistVpnNoteCategories,
  saveGamelistVpnNote,
} from "@/server/gameinfo-gamelist-tutorial";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

// Unlike tutorial/warning, this has no separate `idpass`-mode shape — VPN
// itself is game_list's own `vpn` column, shared by both data modes (see
// gameinfo-gamelist.js's normalizeVpn()), so the note that goes with it is
// addressed by game_id alone.
export async function GET(request, { params }) {
  try {
    await requireGameinfoAccess(request);
    const { id } = await params;
    const [vpnNote, categoryNames] = await Promise.all([
      getGamelistVpnNote(Number(id)),
      listAllGamelistVpnNoteCategories(),
    ]);
    return jsonOk({ vpnNote, categoryNames });
  } catch (error) {
    return handleApiError(error, "โหลดรายละเอียด VPN ไม่สำเร็จ");
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const body = await request.json();
    const vpnNote = await saveGamelistVpnNote(Number(id), body.categories, null, auditActor(user));
    return jsonOk({ vpnNote });
  } catch (error) {
    return handleApiError(error, "บันทึกรายละเอียด VPN ไม่สำเร็จ");
  }
}
