import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { addItemkuGame, deleteItemkuGame, listItemkuGames, slugFromItemkuUrl } from "@/server/itemku-games-repository";
import { clearItemkuCache, inspectItemkuGame } from "@/server/itemku-prices";
import { auditActor, recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ games: await listItemkuGames() });
  } catch (error) {
    return handleApiError(error, "โหลดรายชื่อเกม itemku ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const body = await request.json();
    const slug = slugFromItemkuUrl(body.url);
    const inspected = await inspectItemkuGame(slug);
    const game = await addItemkuGame(inspected);
    clearItemkuCache();
    await recordGameinfoAudit({ gameId: 0, area: "settings", actor: auditActor(user), before: null, after: { itemkuGame: game.label, slug: game.slug } });
    return jsonOk({ game, games: await listItemkuGames() });
  } catch (error) {
    return handleApiError(error, "เพิ่มเกม itemku ไม่สำเร็จ");
  }
}

export async function DELETE(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const value = new URL(request.url).searchParams.get("game") || "";
    const game = await deleteItemkuGame(value);
    clearItemkuCache();
    await recordGameinfoAudit({ gameId: 0, area: "settings", actor: auditActor(user), before: { itemkuGame: game.label, slug: game.slug }, after: null });
    return jsonOk({ game, games: await listItemkuGames() });
  } catch (error) {
    return handleApiError(error, "ลบเกม itemku ไม่สำเร็จ");
  }
}
