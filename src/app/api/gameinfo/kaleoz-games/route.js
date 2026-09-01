import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoAccess, requireGameinfoEditor } from "@/server/auth";
import { addKaleozGame, deleteKaleozGame, listKaleozGames, slugFromKaleozUrl } from "@/server/kaleoz-games-repository";
import { clearKaleozGameCache, inspectKaleozGame } from "@/server/kaleoz-zepeto";
import { deleteGameinfoPricePages } from "@/server/gameinfo-price-page-store";
import { auditActor, recordGameinfoAudit } from "@/server/gameinfo-gamelist-packs";

export async function GET(request) {
  try {
    await requireGameinfoAccess(request);
    return jsonOk({ games: await listKaleozGames() });
  } catch (error) {
    return handleApiError(error, "โหลดรายชื่อเกม Kaleoz ไม่สำเร็จ");
  }
}

export async function POST(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const body = await request.json();
    const slug = slugFromKaleozUrl(body.url);
    const inspected = await inspectKaleozGame(slug);
    const game = await addKaleozGame(inspected);
    clearKaleozGameCache(game.value);
    await recordGameinfoAudit({ gameId: 0, area: "settings", actor: auditActor(user), before: null, after: { kaleozGame: game.label, slug: game.slug } });
    return jsonOk({ game, games: await listKaleozGames() });
  } catch (error) {
    return handleApiError(error, "เพิ่มเกม Kaleoz ไม่สำเร็จ");
  }
}

export async function DELETE(request) {
  try {
    const user = await requireGameinfoEditor(request);
    const value = new URL(request.url).searchParams.get("game") || "";
    const game = await deleteKaleozGame(value);
    clearKaleozGameCache(game.value);
    await deleteGameinfoPricePages("kaleoz", game.value);
    await recordGameinfoAudit({ gameId: 0, area: "settings", actor: auditActor(user), before: { kaleozGame: game.label, slug: game.slug }, after: null });
    return jsonOk({ game, games: await listKaleozGames() });
  } catch (error) {
    return handleApiError(error, "ลบเกม Kaleoz ไม่สำเร็จ");
  }
}
